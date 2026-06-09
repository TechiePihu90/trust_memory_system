from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json
import uuid
from fastapi.middleware.cors import CORSMiddleware
from agents.claim_extractor import extract_claim
from agents.verification import score_confidence
from agents.contradiction import detect_contradiction
from agents.curator import curate
from memory.models import MemoryEntry, ClaimInput

from memory.store import (
    init_db,
    get_all_memories,
    get_memory_by_subject,
    get_memory_by_subject_predicate,
    upsert_memory,
    update_entry,
    downgrade_entry,
    reject_entry,
    forget_entry,
    get_change_log
)

# BatchIngestRequest — ClaimInput import ke BAAD define karo
class BatchIngestRequest(BaseModel):
    claims: List[ClaimInput]


app = FastAPI(
    title="Trust-Aware Memory Intelligence System",
    description="""
## Multi-Agent Memory System

Ingests structured claims from the **Evolving Truth dataset** (`claims_1_1.jsonl`)
and builds a trusted, provenance-aware memory store backed by **PostgreSQL**.

---

### Agent Pipeline (per claim):
1. **Verification Agent** — scores confidence using `source_reliability`, `label`, and existing memory
2. **Contradiction Detector** — finds conflicts for same `subject+predicate` with different `object`
3. **Memory Curator** — decides: `ACCEPTED / UPDATED / DOWNGRADED / REJECTED / FORGOTTEN / MERGED`

---

### Edge Cases Handled:
- Duplicate claims (same wording) → `MERGED` with corroboration count
- Duplicate claims (different wording, same meaning) → `MERGED`
- Conflicting claims (higher source reliability) → `UPDATED`
- Adversarial low-trust claims → `REJECTED`
- Equal-confidence conflicts → `DOWNGRADED` (no oscillation)
- Stale claims resurfacing → `REJECTED` or `DOWNGRADED`
- Missing timestamps → processed with uncertainty flag
- Memory overflow (low-trust fillers) → `REJECTED`

---

### Key question this system answers:
> *"Why do I believe this fact right now, and how has that belief changed over time?"*
    """,
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.on_event("startup")
def startup():
    init_db()


# ─────────────────────────────────────────────────────────────
# CORE PIPELINE
# ─────────────────────────────────────────────────────────────

@app.post("/ingest",
          summary="Ingest one structured claim through the full agent pipeline",
          tags=["Pipeline"])
def ingest(claim: ClaimInput):
    """
    Accepts one claim in the **exact dataset format** (`claims_1_1.jsonl`).

    Runs:
    1. Verification → confidence score
    2. Contradiction detection → conflict check
    3. Curation → action decision
    4. Persist to PostgreSQL

    Returns the action taken and full reasoning.
    """
    ts = claim.timestamp or datetime.utcnow().isoformat()
    claim_dict = {
        "subject":   claim.subject,
        "predicate": claim.predicate,
        "object":    claim.object or ""
    }

    try:
        # Step 1: Get existing memory for same subject+predicate
        existing = get_memory_by_subject_predicate(claim.subject, claim.predicate)

        # Step 2: Verify — score confidence
        verification = score_confidence(
            claim_dict,
            existing,
            claim.source_reliability,
            claim.label,
            claim.verifiable
        )
        confidence = float(verification["confidence"])

        # Step 3: Detect contradiction
        contradiction = detect_contradiction(claim_dict, existing)

        # Step 4: Curator decides
        decision = curate(
            claim_dict,
            confidence,
            contradiction,
            existing,
            claim.source_reliability,
            claim.label
        )
        action     = decision["action"].upper()
        reason     = decision["reason"]
        affects_id = decision.get("affects_fact_id")

        # Step 5: Apply action to PostgreSQL
        if action == "REJECTED":
            pass  # Log rejection — no memory entry written

        elif action in ("ACCEPTED", "MERGED"):
            entry = MemoryEntry(
                subject      = claim.subject,
                predicate    = claim.predicate,
                object       = claim.object or "",
                confidence   = confidence,
                status       = "active",
                sources      = [claim.source_id],
                first_seen   = ts,
                last_updated = ts
            )
            upsert_memory(entry, action, reason, claim.id, old_confidence=0.0)

        elif action == "UPDATED":
            if affects_id:
                update_entry(affects_id, claim.object or "", confidence,
                             claim.source_id, claim.id, reason)
            else:
                entry = MemoryEntry(
                    subject      = claim.subject,
                    predicate    = claim.predicate,
                    object       = claim.object or "",
                    confidence   = confidence,
                    status       = "active",
                    sources      = [claim.source_id],
                    first_seen   = ts,
                    last_updated = ts
                )
                upsert_memory(entry, action, reason, claim.id)

        elif action == "DOWNGRADED":
            if affects_id:
                downgrade_entry(affects_id, claim.id, reason, delta=-0.20)
            elif existing:
                downgrade_entry(existing[0]["fact_id"], claim.id, reason, delta=-0.20)

        elif action == "FORGOTTEN":
            if affects_id:
                forget_entry(affects_id, claim.id, reason)
            elif existing:
                forget_entry(existing[0]["fact_id"], claim.id, reason)

        return {
            "claim_id":                  claim.id,
            "subject":                   claim.subject,
            "predicate":                 claim.predicate,
            "object":                    claim.object,
            "source_id":                 claim.source_id,
            "source_reliability":        claim.source_reliability,
            "label":                     claim.label,
            "action":                    action,
            "confidence":                confidence,
            "verification_reasoning":    verification.get("reasoning"),
            "has_contradiction":         contradiction.get("has_contradiction"),
            "contradiction_explanation": contradiction.get("explanation"),
            "curator_reason":            reason,
            "affects_fact_id":           affects_id,
            "missing_timestamp":         claim.timestamp is None
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/batch-ingest",
          summary="Ingest all claims from the dataset at once",
          tags=["Pipeline"])
def batch_ingest(request: BatchIngestRequest):
    """
    Send the entire `claims_1_1.jsonl` content here wrapped as:
    ```json
    { "claims": [ ...array of claim objects... ] }
    ```

    Each claim goes through the full pipeline sequentially.
    Results show what happened to each claim in order.
    """
    results = []
    for c in request.claims:
        try:
            results.append(ingest(c))
        except Exception as e:
            results.append({
                "claim_id": c.id,
                "error":    str(e),
                "subject":  c.subject
            })
    return {
        "total":   len(results),
        "results": results
    }


@app.post("/ingest-raw",
          summary="Ingest plain text using the Claim Extractor Agent",
          tags=["Pipeline"])
def ingest_raw(text: str, source_id: str, source_reliability: float = 0.5):
    """
    Accepts raw unstructured text and runs the full 4-agent pipeline:

    1. **Claim Extractor** → parses text into subject / predicate / object
    2. **Verification Agent** → scores confidence
    3. **Contradiction Detector** → checks conflicts
    4. **Memory Curator** → decides action

    Use this when you don't have pre-structured claims.
    Example input: *"Startup A raised $5M in 2021"*
    """
    extracted = extract_claim(text, source_id)

    claim = ClaimInput(
        id=str(uuid.uuid4())[:8],
        timestamp=extracted.get("timestamp"),
        source_id=source_id,
        source_reliability=source_reliability,
        verifiable="VERIFIABLE",
        label="SUPPORTS",
        claim=text,
        subject=extracted["subject"],
        predicate=extracted["predicate"],
        object=extracted.get("object", "")
    )
    return ingest(claim)


# ─────────────────────────────────────────────────────────────
# MEMORY QUERIES
# ─────────────────────────────────────────────────────────────

@app.get("/memory",
         summary="Get all stored memory entries grouped by subject",
         tags=["Memory"])
def get_memories():
    """
    Returns the complete trust-aware memory store from PostgreSQL.

    Each entry includes:
    - `subject`, `predicate`, `object`
    - `confidence` (0.0–1.0)
    - `status` (active / outdated / rejected / low_confidence)
    - `sources` list
    - `corroboration_count`
    - `first_seen` and `last_updated`
    """
    all_mem = get_all_memories()
    grouped = {}
    for m in all_mem:
        grouped.setdefault(m["subject"], []).append(m)
    return grouped


@app.get("/memory/{subject}",
         summary="Get all memory entries for a specific subject (entity)",
         tags=["Memory"])
def get_subject_memory(subject: str):
    """
    Returns every memory fact known about a specific entity.

    Example subjects from the dataset: `Startup A`, `GreenTech Corp`,
    `Adrienne Bailon`, `Roman Atwood`, `Homeland`
    """
    data = get_memory_by_subject(subject)
    if not data:
        raise HTTPException(status_code=404,
                            detail=f"No memory found for subject: {subject}")
    return data


@app.get("/changelog",
         summary="Full audit trail of every belief change",
         tags=["Memory"])
def changelog():
    """
    Every update ever made to memory — what changed, when, why, and by how much.

    Each entry contains:
    - `claim_id` — which input claim triggered this change
    - `action` — ACCEPTED / UPDATED / DOWNGRADED / REJECTED / FORGOTTEN / MERGED
    - `old_value` → `new_value`
    - `confidence_delta` — how much confidence changed (positive or negative)
    """
    return get_change_log()


# ─────────────────────────────────────────────────────────────
# EXPLAINABILITY
# ─────────────────────────────────────────────────────────────

@app.get("/explain/{subject}",
         summary="WHY does the system believe what it does about this subject?",
         tags=["Explainability"])
def explain(subject: str):
    """
    ## The core hackathon question:

    **"Why do I believe this fact right now, and how has that belief changed over time?"**

    For each memory entry about the subject, returns:
    - The current claim and confidence
    - The current status
    - The reason the curator accepted/revised it
    - Corroboration count (how many sources agree)
    - Linked change log showing full belief history
    """
    memories = get_memory_by_subject(subject)
    if not memories:
        raise HTTPException(status_code=404,
                            detail=f"No memory found for: {subject}")

    full_log = get_change_log()

    explanation = []
    for m in memories:
        related_log = [
            l for l in full_log
            if l.get("new_value") == m["object"] or l.get("old_value") == m["object"]
        ]
        explanation.append({
            "predicate":       m["predicate"],
            "current_belief":  m["object"],
            "confidence":      m["confidence"],
            "status":          m["status"],
            "corroborated_by": m["corroboration_count"],
            "sources":         m["sources"],
            "first_seen":      m["first_seen"],
            "last_updated":    m["last_updated"],
            "belief_history":  related_log
        })

    return {
        "subject":            subject,
        "total_facts":        len(explanation),
        "memory_explanation": explanation
    }


@app.get("/stats",
         summary="System-wide statistics about the memory store",
         tags=["Explainability"])
def stats():
    """
    Overview of the current state of the memory system:
    - Total facts stored
    - Breakdown by status (active / outdated / rejected / low_confidence)
    - Total change log entries
    - Most corroborated facts
    """
    all_mem = get_all_memories()
    log     = get_change_log()

    status_counts = {}
    for m in all_mem:
        s = m["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    action_counts = {}
    for l in log:
        a = l["action"]
        action_counts[a] = action_counts.get(a, 0) + 1

    top_corroborated = sorted(
        all_mem, key=lambda x: x["corroboration_count"], reverse=True
    )[:5]

    return {
        "total_memory_entries":    len(all_mem),
        "status_breakdown":        status_counts,
        "total_changelog_entries": len(log),
        "action_breakdown":        action_counts,
        "top_corroborated_facts": [
            {
                "subject":             m["subject"],
                "predicate":           m["predicate"],
                "object":              m["object"],
                "corroboration_count": m["corroboration_count"],
                "confidence":          m["confidence"]
            }
            for m in top_corroborated
        ]
    }


# ─────────────────────────────────────────────────────────────
# SYSTEM
# ─────────────────────────────────────────────────────────────

@app.delete("/memory/reset",
            summary="Drop and recreate all tables (dev/demo use only)",
            tags=["System"])
def reset_memory():
    """
    Wipes all memory entries and change log.
    Use before a fresh demo run.
    """
    from memory.store import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS memory_entries"))
        conn.execute(text("DROP TABLE IF EXISTS change_log"))
        conn.commit()
    init_db()
    return {"status": "Memory wiped and tables recreated."}


@app.get("/health", summary="Health check", tags=["System"])
def health():
    return {"status": "ok", "storage": "postgresql", "llm": "groq/llama-3.3-70b-versatile"}