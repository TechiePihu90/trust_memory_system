from pydantic import BaseModel
from typing import Optional, List
import uuid


# ── Input: what comes IN from the dataset (claims_1_1.jsonl) ──────────────────
class ClaimInput(BaseModel):
    id: str
    timestamp: Optional[str] = None          # null = missing timestamp edge case
    source_id: str
    source_reliability: float                 # 0.0–1.0 — used in confidence scoring
    verifiable: str                           # VERIFIABLE | NOT VERIFIABLE
    label: str                                # SUPPORTS | REFUTES | NOT ENOUGH INFO
    claim: str
    subject: str
    predicate: str
    object: Optional[str] = None


# ── Memory store entry: matches memory_store_entry_schema ────────────────────
class MemoryEntry(BaseModel):
    fact_id: str = ""
    subject: str
    predicate: str
    object: str
    confidence: float
    status: str = "active"                   # active | outdated | rejected | low_confidence
    sources: List[str] = []                  # list of source_ids that support this fact
    first_seen: str
    last_updated: str
    corroboration_count: int = 1             # number of independent sources agreeing

    def model_post_init(self, __context):
        if not self.fact_id:
            self.fact_id = str(uuid.uuid4())[:8]


# ── Change log entry: matches change_log_entry_schema ────────────────────────
class ChangeLogEntry(BaseModel):
    claim_id: str
    timestamp: str
    action: str          # ACCEPTED | UPDATED | DOWNGRADED | REJECTED | FORGOTTEN | MERGED
    reason: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    confidence_delta: float = 0.0            # positive or negative change in confidence
