# Trust-Aware Memory Intelligence System

Multi-agent AI system that ingests noisy, conflicting claims and builds
a trusted, explainable memory store backed by PostgreSQL.

## Folder Structure

```
trust_memory_system/
├── main.py                   FastAPI app — all routes, Swagger auto-generated
├── agents/
|   |__claim_extractor.py 
│   ├── verification.py       Scores confidence using source_reliability + label
│   ├── contradiction.py      Detects conflicts for same subject+predicate
│   └── curator.py            Decides: ACCEPTED/UPDATED/DOWNGRADED/REJECTED/FORGOTTEN/MERGED
├── memory/
│   ├── models.py             Pydantic models matching schema_1_1.json exactly
│   └── store.py              PostgreSQL read/write with corroboration logic
├── data/
│   ├── claims_1_1.jsonl      The actual dataset (50 claims, all edge cases)
│   └── schema_1_1.json       Official schema reference
├── requirements.txt
└── .env
```

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Create PostgreSQL database
createdb trust_memory

# 3. Fill in your keys
# Edit .env:
#   GROQ_API_KEY=your_key
#   DATABASE_URL=postgresql://postgres:password@localhost:5432/trust_memory

# 4. Start the server
uvicorn main:app --reload

# 5. Open Swagger UI
# http://localhost:8000/docs
```

## Demo Flow for Judges

| Step | Endpoint | What to show |
|------|----------|--------------|
| 1 | `DELETE /memory/reset` | Fresh start before demo |
| 2 | `POST /batch-ingest` | Paste claims_1_1.jsonl as JSON array — watch all 50 claims processed |
| 3 | `GET /stats` | System overview — action breakdown, corroboration counts |
| 4 | `GET /memory/Startup A` | Show how Startup A's funding belief evolved |
| 5 | `GET /explain/Startup A` | **The money shot** — full belief provenance with history |
| 6 | `GET /explain/GreenTech Corp` | Show equal-confidence conflict handling (no oscillation) |
| 7 | `GET /changelog` | Full audit trail of every belief change |

## How to Use the Dataset for Batch Ingest

The file `data/claims_1_1.jsonl` has one JSON object per line.
To use with `/batch-ingest`, convert to a JSON array:

```python
import json

with open("data/claims_1_1.jsonl") as f:
    claims = [json.loads(line) for line in f if line.strip()]

print(json.dumps(claims, indent=2))
# Paste this output into Swagger /batch-ingest body
```

## Edge Cases the System Handles

| Case | Example from dataset | Action |
|------|----------------------|--------|
| Duplicate same wording | C001 + C002 (both $5M) | MERGED + corroboration_count++ |
| Duplicate different wording | C002 + C003 ($5M vs five million) | MERGED |
| Higher-trust source corrects | C001 ($5M) → C004 ($8M, Forbes) | UPDATED |
| Adversarial low-trust | C006 ($50M, UnknownBlog 0.2) | REJECTED |
| Equal-confidence conflict | C032 vs C033 (GreenTech 2010 vs 2012) | DOWNGRADED |
| Authoritative source resolves | C034 (SEC Filing 0.98) | ACCEPTED/UPDATED |
| Stale claim resurfaces | C024 (old subscriber count) | REJECTED/DOWNGRADED |
| Missing timestamp | C031 (AnonTip, null timestamp) | Processed with uncertainty |
| Memory overflow fillers | C035–C049 (LowTrustBlog, NOT VERIFIABLE) | REJECTED |
