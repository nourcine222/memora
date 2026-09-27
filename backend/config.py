"""Application configuration, loaded from environment variables."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _path(name: str, default: str) -> str:
    value = Path(os.getenv(name, default))
    return str(value if value.is_absolute() else ROOT / value)


DATABASE_URL = os.getenv("MEMORA_DATABASE_URL", f"sqlite:///{_path('MEMORA_DATABASE_PATH', 'memora.db')}")
CHROMA_PATH = _path("MEMORA_CHROMA_PATH", "chroma_db")
EMBEDDING_MODEL = os.getenv("MEMORA_EMBEDDING_MODEL", "all-MiniLM-L6-v2")
EMOTION_MODEL = os.getenv("MEMORA_EMOTION_MODEL", "j-hartmann/emotion-english-distilroberta-base")
NER_MODEL = os.getenv("MEMORA_NER_MODEL", "dslim/bert-base-NER")
ENABLE_DEV_ROUTES = os.getenv("MEMORA_ENABLE_DEV_ROUTES", "false").lower() in {"1", "true", "yes"}
MAX_TEXT_LENGTH = int(os.getenv("MEMORA_MAX_TEXT_LENGTH", "10000"))
DEFAULT_PAGE_SIZE = int(os.getenv("MEMORA_DEFAULT_PAGE_SIZE", "20"))
MAX_PAGE_SIZE = int(os.getenv("MEMORA_MAX_PAGE_SIZE", "100"))
MAX_SEARCH_RESULTS = int(os.getenv("MEMORA_MAX_SEARCH_RESULTS", "20"))
