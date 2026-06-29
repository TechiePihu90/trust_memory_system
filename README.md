# Trust-Aware Memory Intelligence System

A multi-agent AI system that ingests noisy, conflicting claims, evaluates trustworthiness, resolves contradictions, and builds a trusted, explainable memory store backed by PostgreSQL.

The system includes a React-based frontend for interactive claim ingestion, memory exploration, and explanation visualization, along with a FastAPI backend that powers the trust-aware reasoning pipeline.

---

## Architecture

### Frontend
- React + Vite
- Interactive dashboard for memory exploration
- Claim ingestion interface
- Belief explanation and provenance visualization
- Statistics and changelog views

### Backend
- FastAPI
- Multi-agent trust reasoning pipeline
- PostgreSQL memory store
- Swagger UI for API testing and demonstration

---

## Folder Structure

```text
trust_memory_system/
├── frontend/
│   └── system-frontend/      React + Vite frontend
│
├── trust_memory_system/
│   ├── main.py               FastAPI application
│   │
│   ├── agents/
│   │   ├── claim_extractor.py
│   │   ├── verification.py
│   │   ├── contradiction.py
│   │   └── curator.py
│   │
│   ├── memory/
│   │   ├── models.py
│   │   └── store.py
│   │
│   ├── data/
│   │   ├── claims_1_1.jsonl
│   │   └── schema_1_1.json
│   │
│   ├── requirements.txt
│   └── .env
```

---

## Key Features

- Multi-agent claim processing pipeline
- Trust-aware confidence scoring
- Contradiction detection and resolution
- Explainable memory evolution
- Full provenance tracking
- Corroboration-based belief strengthening
- Complete audit trail
- Interactive React dashboard
- REST APIs with Swagger documentation

---

## Technology Stack

### Frontend
- React
- Vite
- JavaScript
- CSS

### Backend
- FastAPI
- Python
- PostgreSQL
- Pydantic
- Groq API

---

## Setup

### Backend

```bash
pip install -r requirements.txt

uvicorn main:app --reload
```

Swagger UI:

```text
http://localhost:8000/docs
```

### Frontend

```bash
cd frontend/system-frontend

npm install

npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

---

## Demo Flow for Judges

| Step | Endpoint/Page | Purpose |
|--------|-------------|----------|
| 1 | Reset Memory | Start from a clean state |
| 2 | Batch Ingest | Process all claims |
| 3 | Statistics Dashboard | View trust metrics |
| 4 | Memory Explorer | Inspect stored beliefs |
| 5 | Explain View | Show provenance and reasoning |
| 6 | Conflict Example | Demonstrate contradiction handling |
| 7 | Changelog | Show complete audit history |

---

## Edge Cases Handled

- Duplicate claims
- Reworded duplicates
- Higher-trust corrections
- Adversarial low-trust sources
- Equal-confidence conflicts
- Missing timestamps
- Stale information resurfacing
- Memory overflow and noise filtering

---

## Outcomes

The curator agent can assign the following actions:

- ACCEPTED
- UPDATED
- MERGED
- DOWNGRADED
- REJECTED
- FORGOTTEN
