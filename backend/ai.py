"""Lazy loading and access to the local transformer models."""
from functools import lru_cache

from . import config


@lru_cache(maxsize=1)
def get_models():
    from sentence_transformers import SentenceTransformer
    from transformers import pipeline

    return {
        "embedding": SentenceTransformer(config.EMBEDDING_MODEL),
        "emotion": pipeline("text-classification", model=config.EMOTION_MODEL, top_k=None),
        "ner": pipeline("ner", model=config.NER_MODEL, aggregation_strategy="simple"),
    }
