from groq import Groq
from dotenv import load_dotenv
import os, json

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def detect_contradiction(claim: dict, existing_memories: list) -> dict:
    """
    Detects contradiction by checking if any existing memory for the same
    subject+predicate has a DIFFERENT object value.

    Examples from dataset:
    - Startup A raised funding of $5M  vs  $8M  (same predicate, different amount)
    - GreenTech Corp founded in 2010   vs  2012  (equal confidence conflict)
    - Adrienne Bailon is an accountant vs singer+TV personality
    """
    if not existing_memories:
        return {
            "has_contradiction": False,
            "conflicting_ids":   [],
            "explanation":       "No prior memory exists for this subject+predicate."
        }

    prompt = f"""You are a contradiction detection agent.

New claim:
  subject   = "{claim['subject']}"
  predicate = "{claim['predicate']}"
  object    = "{claim['object']}"

Existing memory entries for the SAME subject+predicate:
{json.dumps(existing_memories, indent=2)}

A contradiction exists when the new claim's object CANNOT logically co-exist with
an existing memory's object for the same predicate.

Examples of contradictions:
- "raised $5M" vs "raised $8M" for the same year → contradiction
- "founded in 2010" vs "founded in 2012" → contradiction
- "worked with Fox" vs "worked with NBC" (as primary network) → contradiction

Examples of NO contradiction:
- "raised $5M in 2021" vs "raised $8M in 2022" → different years, no conflict
- Same object, different wording ($5M vs five million dollars) → same fact, no conflict

Return ONLY valid JSON, no markdown:
{{"has_contradiction": true, "conflicting_ids": ["fact_id_here"], "explanation": "one sentence"}}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        temperature=0.1
    )
    raw = response.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)
