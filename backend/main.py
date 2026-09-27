"""FastAPI entry point for the Memora journal backend."""
import logging
from contextlib import asynccontextmanager
from datetime import datetime

import dateparser
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session
from sklearn.cluster import KMeans

from . import config
from .ai import get_models
from .database import JournalEntryDB, get_db, init_db
from .schemas import EvaluationText, JournalEntry, JournalEntryResponse, MemoryQuery
from .vector_store import journal_collection, upsert_entry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("memora")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.models = None
    if config.ENABLE_DEV_ROUTES:
        try:
            app.state.models = get_models()
            logger.info("AI models loaded for development routes")
        except Exception:
            logger.exception("Could not preload AI models")
    yield


app = FastAPI(title="Memora API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def models():
    try:
        loaded = getattr(app.state, "models", None)
        if loaded is None:
            loaded = get_models()
            app.state.models = loaded
        return loaded
    except Exception as exc:
        logger.exception("AI model initialization or inference setup failed")
        raise HTTPException(status_code=503, detail="AI models are unavailable") from exc


@app.exception_handler(Exception)
async def unexpected_error_handler(request, exc):
    logger.exception("Unhandled API error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "An unexpected server error occurred"})


@app.get("/")
def home():
    return {"message": "Memora is alive!"}


@app.get("/health")
def health():
    return {"status": "ok", "ai_models_loaded": getattr(app.state, "models", None) is not None}


@app.post("/journal")
def create_journal_entry(entry: JournalEntry, db: Session = Depends(get_db)):
    new_entry = JournalEntryDB(text=entry.text.strip())
    if not new_entry.text:
        raise HTTPException(status_code=422, detail="Journal text must not be blank")
    db.add(new_entry)
    try:
        db.commit()
        db.refresh(new_entry)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed saving journal entry")
        raise HTTPException(status_code=500, detail="Could not save journal entry") from exc

    try:
        ai = models()
        vector = ai["embedding"].encode(new_entry.text).tolist()
        emotion_results = ai["emotion"](new_entry.text)[0]
        upsert_entry(new_entry, vector)
    except HTTPException as exc:
        # The durable SQLite record remains available for later index repair.
        raise HTTPException(
            status_code=503,
            detail=f"Entry {new_entry.id} was saved but not fully analyzed/indexed; run POST /maintenance/reindex",
        ) from exc
    except Exception as exc:
        logger.exception("Entry %s saved but AI analysis or vector indexing failed", new_entry.id)
        raise HTTPException(
            status_code=503,
            detail=f"Entry {new_entry.id} was saved but not fully analyzed/indexed; run POST /maintenance/reindex",
        ) from exc

    return {
        "message": "Journal entry analyzed and memorized!",
        "id": new_entry.id,
        "entry": new_entry.text,
        "created_at": new_entry.created_at,
        "emotions": emotion_results,
    }


@app.get("/journal", response_model=list[JournalEntryResponse])
def get_journal_entries(
    limit: int = Query(default=config.DEFAULT_PAGE_SIZE, ge=1, le=config.MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return db.query(JournalEntryDB).order_by(desc(JournalEntryDB.created_at), desc(JournalEntryDB.id)).offset(offset).limit(limit).all()


@app.post("/search-memory")
def search_memory(query: MemoryQuery, limit: int = Query(default=3, ge=1, le=config.MAX_SEARCH_RESULTS)):
    try:
        vector = models()["embedding"].encode(query.query).tolist()
        count = min(limit, journal_collection.count())
        if count == 0:
            return {"query": query.query, "results": []}
        results = journal_collection.query(query_embeddings=[vector], n_results=count, include=["documents", "metadatas", "distances"])
        return {
            "query": query.query,
            "results": [
                {"text": doc, "metadata": meta, "distance": distance}
                for doc, meta, distance in zip(results["documents"][0], results["metadatas"][0], results["distances"][0])
            ],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Semantic search failed")
        raise HTTPException(status_code=503, detail="Semantic search is temporarily unavailable") from exc


@app.post("/maintenance/reindex")
def reindex_missing_entries(db: Session = Depends(get_db)):
    """Restore vectors absent from ChromaDB using the authoritative SQLite rows."""
    try:
        indexed = set(journal_collection.get(include=[]).get("ids", []))
        rows = db.query(JournalEntryDB).order_by(JournalEntryDB.id).all()
        missing = [row for row in rows if str(row.id) not in indexed]
        if not missing:
            return {"indexed": 0, "missing_before": 0}
        vectors = models()["embedding"].encode([row.text for row in missing]).tolist()
        for row, vector in zip(missing, vectors):
            upsert_entry(row, vector)
        return {"indexed": len(missing), "missing_before": len(missing)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ChromaDB reconciliation failed")
        raise HTTPException(status_code=503, detail="Index reconciliation failed") from exc


@app.get("/analyze-themes")
def analyze_themes():
    memories = journal_collection.get(include=["documents", "embeddings", "metadatas"])
    documents, embeddings, metadatas = memories["documents"], memories["embeddings"], memories["metadatas"]
    if embeddings is None or len(embeddings) < 2:
        return {"message": "Not enough journal entries yet.", "entries": len(embeddings) if embeddings is not None else 0}
    number_of_themes = min(3, len(embeddings))
    labels = KMeans(n_clusters=number_of_themes, random_state=42, n_init=10).fit_predict(np.asarray(embeddings))
    return {"number_of_themes": number_of_themes, "themes": [
        {"journal_id": (meta or {}).get("journal_id"), "text": doc, "theme": int(labels[i])}
        for i, (doc, meta) in enumerate(zip(documents, metadatas))
    ]}


@app.get("/build-memory-graph")
def build_memory_graph():
    memories = journal_collection.get(include=["documents"])
    nodes, relationships = {}, set()
    ignored = {"i", "uni", "university", "school", "exam", "exams"}
    ner = models()["ner"]
    for document in memories["documents"]:
        entities = ner(document)
        in_memory = []
        for entity in entities:
            word = entity["word"].replace("##", "").strip()
            if float(entity["score"]) < 0.80 or len(word) < 2 or word.lower() in ignored:
                continue
            key = word.lower()
            nodes.setdefault(key, {"id": key, "label": word, "type": entity["entity_group"]})
            if key not in in_memory:
                in_memory.append(key)
        for i, source in enumerate(in_memory):
            for target in in_memory[i + 1:]:
                relationships.add((source, target))
    return {"nodes": list(nodes.values()), "relationships": [
        {"source": source, "target": target, "type": "mentioned_with"} for source, target in sorted(relationships)
    ]}


def _emotion_prediction(text):
    values = models()["emotion"](text)[0]
    best = max(values, key=lambda item: item["score"])
    return values, best


if config.ENABLE_DEV_ROUTES:
    @app.post("/evaluate-emotion")
    def evaluate_emotion(data: EvaluationText):
        values, best = _emotion_prediction(data.text)
        return {"text": data.text, "predicted_emotion": best["label"], "confidence": float(best["score"]), "all_emotions": values}

    @app.get("/evaluate-emotion-suite")
    def evaluate_emotion_suite():
        cases = [("I am so happy today. Everything went perfectly!", "joy"), ("I am really sad and I feel like crying.", "sadness"), ("I am furious about what happened.", "anger"), ("I am scared about what might happen tomorrow.", "fear"), ("That surprise completely shocked me!", "surprise")]
        results = []
        for text, expected in cases:
            values, best = _emotion_prediction(text)
            results.append({"text": text, "expected": expected, "predicted": best["label"], "confidence": float(best["score"]), "correct": best["label"] == expected})
        correct = sum(row["correct"] for row in results)
        return {"total_tests": len(results), "correct": correct, "accuracy": correct / len(results), "results": results}

    @app.get("/evaluate-search")
    def evaluate_search():
        cases = [("university exams", "exam"), ("feeling lonely", "lonely"), ("friends", "friend")]
        results = []
        for query, keyword in cases:
            vector = models()["embedding"].encode(query).tolist()
            count = min(3, journal_collection.count())
            docs = journal_collection.query(query_embeddings=[vector], n_results=count)["documents"][0] if count else []
            results.append({"query": query, "expected_keyword": keyword, "found": any(keyword in doc.lower() for doc in docs), "results": docs})
        successful = sum(row["found"] for row in results)
        return {"total_tests": len(results), "successful": successful, "accuracy": successful / len(results), "results": results}

    @app.get("/evaluation-dashboard")
    def evaluation_dashboard():
        cases = [("I am so happy today!", "joy"), ("I feel really sad.", "sadness"), ("I am furious!", "anger"), ("I am scared.", "fear"), ("That completely surprised me!", "surprise")]
        correct = sum(_emotion_prediction(text)[1]["label"] == expected for text, expected in cases)
        return {"emotion": {"accuracy": correct / len(cases), "tests": len(cases)}, "semantic_search": {"status": "evaluated", "endpoint": "/evaluate-search"}}

    @app.get("/evaluation-chart")
    def evaluation_chart():
        chart = []
        for text, expected in [("Happy", "joy"), ("Sad", "sadness"), ("Furious", "anger"), ("Scared", "fear"), ("Surprised", "surprise")]:
            _, best = _emotion_prediction(text)
            chart.append({"emotion": expected, "confidence": round(float(best["score"]), 4), "correct": best["label"] == expected})
        return {"chart": chart}

    @app.get("/test-embedding")
    def test_embedding():
        text = "I feel lonely today."
        return {"text": text, "vector": models()["embedding"].encode(text).tolist()}

    @app.get("/test-memory")
    def test_memory():
        text = "I feel lonely today."
        journal_collection.upsert(ids=["test-memory"], documents=[text], embeddings=[models()["embedding"].encode(text).tolist()], metadatas=[{"type": "test"}])
        return {"message": "Memory stored!", "text": text}

    @app.get("/test-emotion")
    def test_emotion():
        text = "I am really happy today because everything went well."
        return {"text": text, "emotions": models()["emotion"](text)}

    @app.get("/test-ner")
    def test_ner():
        text = "Iheb texted me about my university exams."
        return {"text": text, "entities": models()["ner"](text)}

    @app.get("/test-time")
    def test_time():
        texts = ["I studied for my exam yesterday.", "I met my friends last Monday.", "I have an exam next week.", "Today I feel stressed.", "I started university in August.", "I saw my friend three days ago."]
        return {"results": [{"text": text, "date": (dateparser.parse(text, settings={"RELATIVE_BASE": datetime.now()}).isoformat() if dateparser.parse(text, settings={"RELATIVE_BASE": datetime.now()}) else None)} for text in texts]}
