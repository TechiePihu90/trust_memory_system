from groq import Groq
from dotenv import load_dotenv
import os, json

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def score_confidence(claim: dict, existing_memories: list,
                     source_reliability: float, label: str,
                     verifiable: str) -> dict:
    """
    Score confidence for a claim using:
    - source_reliability  (given directly in dataset — strong prior)
    - label               (SUPPORTS / REFUTES / NOT ENOUGH INFO)
    - verifiable          (VERIFIABLE / NOT VERIFIABLE)
    - existing memory     (corroboration or contradiction)

    No need to call LLM for claim parsing — subject/predicate/object already structured.
    LLM is used only to reason about the combined evidence.
    """
    context = json.dumps(existing_memories, indent=2) if existing_memories \
              else "No prior memory for this subject+predicate."

    prompt = f"""You are a fact verification agent. Assign a confidence score for this claim.

Claim:
  subject   = "{claim['subject']}"
  predicate = "{claim['predicate']}"
  object    = "{claim['object']}"

Evidence signals:
  source_reliability : {source_reliability}  (0.0 = untrustworthy, 1.0 = fully reliable)
  label              : {label}               (SUPPORTS / REFUTES / NOT ENOUGH INFO)
  verifiable         : {verifiable}          (VERIFIABLE / NOT VERIFIABLE)

Existing memory for same subject+predicate:
{context}

Scoring logic to follow:
1. Start from source_reliability as your base score
2. If label = REFUTES         → multiply base by 0.35 (this source says fact is wrong)
3. If label = NOT ENOUGH INFO → cap confidence at 0.50
4. If verifiable = NOT VERIFIABLE → reduce by 0.10
5. If existing memory has the SAME object → boost by +0.05 (corroboration)
6. If existing memory has a DIFFERENT object (conflict) → reduce by 0.15
7. Final confidence must be in range [0.0, 0.98]

Return ONLY valid JSON, no markdown, no explanation outside JSON:
{{"confidence": 0.82, "reasoning": "one sentence explaining the score"}}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=150,
        temperature=0.1
    )
    raw = response.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)
