"""Retrieve relevant GRAS notices from ChromaDB by semantic query."""

import json
import logging
import os
import threading
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

import chromadb
from chromadb.utils import embedding_functions

CHROMA_DIR = Path("data/chroma")
COLLECTION_NAME = "gras_notices"


_collection = None
_collection_lock = threading.Lock()


def get_collection():
    global _collection
    if _collection is None:
        with _collection_lock:
            if _collection is None:
                client = chromadb.PersistentClient(path=str(CHROMA_DIR))
                ef = embedding_functions.OpenAIEmbeddingFunction(
                    api_key=os.environ["OPENAI_API_KEY"],
                    model_name="text-embedding-3-small",
                )
                _collection = client.get_collection(COLLECTION_NAME, embedding_function=ef)
    return _collection


def _group_by_grn(results: dict, top_n: int) -> list[dict]:
    """Collapse multiple chunks per notice, keeping top_n distinct notices."""
    seen: dict[int, dict] = {}
    for doc, meta, distance in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        grn = meta["grn_number"]
        if grn not in seen:
            seen[grn] = {**meta, "chunks": [], "best_distance": distance}
        seen[grn]["chunks"].append({"text": doc, "section": meta.get("section", ""), "distance": distance})

    # Sort by best matching chunk distance, return top_n
    grouped = sorted(seen.values(), key=lambda x: x["best_distance"])
    return grouped[:top_n]


def retrieve(query: str, top_notices: int = 3, chunks_per_status: int = 15) -> dict:
    """
    Query ChromaDB separately for approved and withdrawn notices.
    Returns top_notices distinct notices per status.
    """
    collection = get_collection()

    approved_raw = collection.query(
        query_texts=[query],
        n_results=chunks_per_status,
        where={"status": "no_questions"},
        include=["documents", "metadatas", "distances"],
    )
    withdrawn_raw = collection.query(
        query_texts=[query],
        n_results=chunks_per_status,
        where={"status": "withdrawn"},
        include=["documents", "metadatas", "distances"],
    )

    return {
        "approved_notices": _group_by_grn(approved_raw, top_notices),
        "withdrawn_notices": _group_by_grn(withdrawn_raw, top_notices),
    }


if __name__ == "__main__":
    TEST_QUERY = "dietary exposure methodology for precision fermentation derived protein"
    print(f"Query: {TEST_QUERY!r}\n")

    results = retrieve(TEST_QUERY, top_notices=3)

    for status_key, label in [("approved_notices", "APPROVED"), ("withdrawn_notices", "WITHDRAWN")]:
        print(f"--- {label} ---")
        for notice in results[status_key]:
            print(f"  GRN {notice['grn_number']} | {notice['substance_name']} | {notice['notifier']}")
            print(f"  Status: {notice['status']} | Method: {notice['dietary_exposure_method']}")
            print(f"  Best distance: {notice['best_distance']:.4f}")
            best_chunk = notice['chunks'][0]['text'][:200].replace('\n', ' ')
            print(f"  Top chunk: {best_chunk}...")
            print()
