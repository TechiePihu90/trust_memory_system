from groq import Groq
from dotenv import load_dotenv
import os, json

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def extract_claim(raw_text: str, source_id: str) -> dict:
    prompt = f"""Extract the factual claim from this raw text into structured fields.

Text: "{raw_text}"
Source: {source_id}

Return ONLY valid JSON, no markdown:
{{
  "subject": "the entity this claim is about",
  "predicate": "the relationship or property",
  "object": "the value being asserted",
  "timestamp": null
}}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],  #we define roles here 
        max_tokens=200,
        temperature=0.1
    )
    raw = response.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)