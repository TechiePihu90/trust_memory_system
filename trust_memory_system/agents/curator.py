from groq import Groq
from dotenv import load_dotenv
import os, json

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def curate(claim: dict, confidence: float, contradiction: dict,
           existing_memories: list, source_reliability: float, label: str) -> dict:
    """
    Decides what to do with the incoming claim based on:
    - confidence score from verification agent
    - contradiction detection result
    - existing memory state
    - source_reliability and label from dataset

    Actions map to the change_log_entry_schema:
    ACCEPTED  → new fact, no conflict
    UPDATED   → corrects/replaces an existing fact
    DOWNGRADED→ reduces confidence of existing memory
    REJECTED  → adversarial/spam/too low confidence
    FORGOTTEN → old memory made irrelevant by new fact
    MERGED    → same fact from another source (handled in store.py automatically)
    """
    context = json.dumps(existing_memories, indent=2) if existing_memories \
              else "No prior memory."

    prompt = f"""You are a memory curator agent. Decide what action to take for this claim.

New claim:
  subject            = "{claim['subject']}"
  predicate          = "{claim['predicate']}"
  object             = "{claim['object']}"
  source_reliability = {source_reliability}
  label              = {label}

Confidence score from verifier : {confidence}
Contradiction detected         : {contradiction['has_contradiction']}
Contradiction explanation      : {contradiction['explanation']}
Conflicting fact IDs           : {contradiction['conflicting_ids']}

Existing memory:
{context}

Decision rules:
- REJECTED   → confidence < 0.25 OR source_reliability < 0.2 OR label = REFUTES with low source score
- ACCEPTED   → no contradiction, confidence >= 0.5, new fact not seen before
- MERGED     → same object already exists in memory from another source (store handles this)
- UPDATED    → contradicts existing memory AND new source is more reliable OR more recent
- DOWNGRADED → contradicts existing memory BUT new source is less reliable (don't update, just reduce old confidence)
- FORGOTTEN  → existing memory is now clearly outdated because of stronger new evidence

Special cases:
- Equal confidence conflict (e.g. GreenTech 2010 vs 2012 same reliability) → DOWNGRADE both, do NOT oscillate
- Stale resurface (old claim comes back after a newer one) → REJECTED or DOWNGRADED
- Missing timestamp → treat as lower priority, still process but note uncertainty

Return ONLY valid JSON, no markdown:
{{
  "action": "ACCEPTED",
  "reason": "one sentence explaining the decision",
  "affects_fact_id": null
}}

affects_fact_id = the fact_id of the memory entry being UPDATED/DOWNGRADED/FORGOTTEN, or null."""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=250,
        temperature=0.1
    )
    raw = response.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)
