# Memora backend

FastAPI backend for a personal journal. SQLite is the source of truth for entries; ChromaDB stores embeddings for semantic search. Transformer models provide embeddings, emotion classification, and named entity recognition.

## Run locally

From the repository root, create a virtual environment, install dependencies, then start the API:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn backend.main:app --reload
```

The first request that needs an AI model downloads and loads it, so it can take longer than later requests. Data paths default to `memora.db` and `chroma_db` in the repository root. Override them with environment variables shown in `.env.example`. API documentation is available at `/docs`.

## Desktop frontend

The React + TypeScript UI is in `frontend/` and runs in an Electron window. Start the API from the repository root, then open a second terminal:

```powershell
cd frontend
npm install
npm run desktop
```

To use the UI in a browser instead, run `npm run dev` from `frontend/`. It connects to `http://127.0.0.1:8000` by default; set `VITE_API_BASE_URL` to change that address.

## API overview

- `POST /journal` saves a journal entry, analyzes its emotion, and indexes it for search.
- `GET /journal?limit=20&offset=0` returns newest entries first, with bounded pagination.
- `POST /search-memory?limit=3` performs semantic search and returns distances with each match.
- `POST /maintenance/reindex` restores ChromaDB vectors missing for SQLite entries.
- `GET /analyze-themes` clusters indexed entries; `GET /build-memory-graph` links entities mentioned together.
- `GET /health` reports API availability and whether models have been loaded.

Development and evaluation endpoints (`/test-*`, `/evaluate-*`) are disabled by default. Enable them with `MEMORA_ENABLE_DEV_ROUTES=true`.

## Storage consistency

SQLite commits before model inference and ChromaDB indexing. If inference or indexing fails, the API returns an error that includes the saved entry ID; the journal text is retained. Run `POST /maintenance/reindex` after model availability is restored to index missing entries.
