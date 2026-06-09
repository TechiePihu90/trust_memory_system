from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os, json
from datetime import datetime

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=1,
    max_overflow=0,
    execution_options={"isolation_level": "AUTOCOMMIT"}
)


# ── Table setup ──────────────────────────────────────────────────────────────

def init_db():
    """Create all tables if they don't exist."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS memory_entries (
                fact_id             VARCHAR(16) PRIMARY KEY,
                subject             TEXT NOT NULL,
                predicate           TEXT NOT NULL,
                object              TEXT NOT NULL,
                confidence          FLOAT NOT NULL,
                status              TEXT DEFAULT 'active',
                sources             JSONB DEFAULT '[]',
                first_seen          TEXT,
                last_updated        TEXT,
                corroboration_count INT DEFAULT 1
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS change_log (
                id                SERIAL PRIMARY KEY,
                claim_id          TEXT,
                logged_at         TEXT,
                action            TEXT,
                reason            TEXT,
                old_value         TEXT,
                new_value         TEXT,
                confidence_delta  FLOAT DEFAULT 0.0
            )
        """))
        conn.commit()


# ── Read operations ───────────────────────────────────────────────────────────

def get_all_memories() -> list:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM memory_entries ORDER BY subject, predicate")
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_memory_by_subject(subject: str) -> list:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM memory_entries WHERE LOWER(subject) = LOWER(:s)"),
            {"s": subject}
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_memory_by_subject_predicate(subject: str, predicate: str) -> list:
    """
    Find all existing entries for the same subject+predicate pair.
    Used by contradiction detector — same subject+predicate but different object = conflict.
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT * FROM memory_entries
                WHERE LOWER(subject)   = LOWER(:s)
                AND   LOWER(predicate) = LOWER(:p)
            """),
            {"s": subject, "p": predicate}
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_change_log() -> list:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM change_log ORDER BY id DESC")
        ).fetchall()
    return [dict(r._mapping) for r in rows]


# ── Write operations ──────────────────────────────────────────────────────────

def upsert_memory(entry, action: str, reason: str,
                  claim_id: str, old_confidence: float = 0.0):
    """
    Insert a new memory entry OR merge with an existing one if same object value.
    Corroboration: same subject+predicate+object from a new source → increment count.
    """
    now = datetime.utcnow().isoformat()
    existing = get_memory_by_subject_predicate(entry.subject, entry.predicate)

    # Check if exact same object already exists (corroboration)
    matched = None
    for m in existing:
        if m["object"].lower().strip() == entry.object.lower().strip():
            matched = m
            break

    with engine.connect() as conn:
        if matched:
            # Same fact from a new independent source → MERGED
            old_sources = matched["sources"] if isinstance(matched["sources"], list) \
                          else json.loads(matched["sources"])
            if entry.sources and entry.sources[0] not in old_sources:
                old_sources.append(entry.sources[0])

            old_conf = matched["confidence"]
            new_conf  = min(0.98, max(entry.confidence, old_conf))  # corroboration never lowers
            delta = round(new_conf - old_conf, 4)

            conn.execute(text("""
                UPDATE memory_entries
                SET confidence          = :confidence,
                    status              = :status,
                    sources             = CAST(:sources AS jsonb),
                    last_updated        = :last_updated,
                    corroboration_count = corroboration_count + 1
                WHERE fact_id = :fid
            """), {
                "confidence":  new_conf,
                "status":      entry.status,
                "sources":     json.dumps(old_sources),
                "last_updated": now,
                "fid":         matched["fact_id"]
            })
            _log_change(conn, claim_id, now, "MERGED", reason,
                        matched["object"], entry.object, delta)

        else:
            # Brand-new fact
            delta = round(entry.confidence - old_confidence, 4)
            conn.execute(text("""
                INSERT INTO memory_entries
                    (fact_id, subject, predicate, object, confidence, status,
                     sources, first_seen, last_updated, corroboration_count)
                VALUES
                    (:fact_id, :subject, :predicate, :object, :confidence, :status,
                     CAST(:sources AS jsonb), :first_seen, :last_updated, 1)
            """), {
                "fact_id":    entry.fact_id,
                "subject":    entry.subject,
                "predicate":  entry.predicate,
                "object":     entry.object,
                "confidence": entry.confidence,
                "status":     entry.status,
                "sources":    json.dumps(entry.sources),
                "first_seen": entry.first_seen,
                "last_updated": now
            })
            _log_change(conn, claim_id, now, action, reason,
                        None, entry.object, delta)

        conn.commit()


def update_entry(fact_id: str, new_object: str, new_confidence: float,
                 new_source: str, claim_id: str, reason: str):
    """
    Revise an existing memory entry with a new object value (e.g. funding amount corrected).
    """
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM memory_entries WHERE fact_id = :fid"),
            {"fid": fact_id}
        ).fetchone()
        if not row:
            return
        old = _row_to_dict(row)
        old_conf = old["confidence"]

        old_sources = old["sources"] if isinstance(old["sources"], list) \
                      else json.loads(old["sources"])
        if new_source not in old_sources:
            old_sources.append(new_source)

        delta = round(new_confidence - old_conf, 4)

        conn.execute(text("""
            UPDATE memory_entries
            SET object       = :object,
                confidence   = :confidence,
                status       = 'active',
                sources      = CAST(:sources AS jsonb),
                last_updated = :now
            WHERE fact_id = :fid
        """), {
            "object":     new_object,
            "confidence": new_confidence,
            "sources":    json.dumps(old_sources),
            "now":        now,
            "fid":        fact_id
        })
        _log_change(conn, claim_id, now, "UPDATED", reason,
                    old["object"], new_object, delta)
        conn.commit()


def downgrade_entry(fact_id: str, claim_id: str, reason: str, delta: float = -0.2):
    """Lower the confidence of an existing memory entry."""
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT confidence FROM memory_entries WHERE fact_id = :fid"),
            {"fid": fact_id}
        ).fetchone()
        if not row:
            return
        old_conf = row[0]
        new_conf = max(0.05, round(old_conf + delta, 4))
        new_status = "low_confidence" if new_conf < 0.3 else "active"

        conn.execute(text("""
            UPDATE memory_entries
            SET confidence   = :confidence,
                status       = :status,
                last_updated = :now
            WHERE fact_id = :fid
        """), {"confidence": new_conf, "status": new_status, "now": now, "fid": fact_id})

        _log_change(conn, claim_id, now, "DOWNGRADED", reason,
                    str(old_conf), str(new_conf), round(new_conf - old_conf, 4))
        conn.commit()


def reject_entry(fact_id: str, claim_id: str, reason: str):
    """Mark a memory entry as rejected."""
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE memory_entries
            SET status = 'rejected', last_updated = :now
            WHERE fact_id = :fid
        """), {"now": now, "fid": fact_id})
        _log_change(conn, claim_id, now, "REJECTED", reason, None, None, 0.0)
        conn.commit()


def forget_entry(fact_id: str, claim_id: str, reason: str):
    """Mark a memory entry as outdated (forgotten)."""
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT confidence FROM memory_entries WHERE fact_id = :fid"),
            {"fid": fact_id}
        ).fetchone()
        old_conf = row[0] if row else 0.0

        conn.execute(text("""
            UPDATE memory_entries
            SET status = 'outdated', last_updated = :now
            WHERE fact_id = :fid
        """), {"now": now, "fid": fact_id})
        _log_change(conn, claim_id, now, "FORGOTTEN", reason,
                    str(old_conf), None, round(-old_conf, 4))
        conn.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    d = dict(row._mapping)
    if isinstance(d.get("sources"), str):
        d["sources"] = json.loads(d["sources"])
    return d


def _log_change(conn, claim_id, timestamp, action, reason,
                old_value, new_value, confidence_delta):
    conn.execute(text("""
        INSERT INTO change_log
            (claim_id, logged_at, action, reason, old_value, new_value, confidence_delta)
        VALUES
            (:claim_id, :logged_at, :action, :reason, :old_value, :new_value, :confidence_delta)
    """), {
        "claim_id":         claim_id,
        "logged_at":        timestamp,
        "action":           action,
        "reason":           reason,
        "old_value":        old_value,
        "new_value":        new_value,
        "confidence_delta": confidence_delta
    })
