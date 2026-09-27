"""ChromaDB initialization and journal indexing helpers."""
import chromadb

from .config import CHROMA_PATH

client = chromadb.PersistentClient(path=CHROMA_PATH)
journal_collection = client.get_or_create_collection(name="journal_memories")


def upsert_entry(entry, vector):
    journal_collection.upsert(
        ids=[str(entry.id)],
        documents=[entry.text],
        embeddings=[vector],
        metadatas=[{"journal_id": entry.id, "created_at": entry.created_at.isoformat()}],
    )
