"""Retrieve relevant GRAS notices from Pinecone by semantic query."""

import os
import threading
from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

from openai import OpenAI
from pinecone import Pinecone

INDEX_NAME  = os.environ.get("PINECONE_INDEX", "gras-notices")
EMBED_MODEL = "text-embedding-3-small"

_index      = None
_oai        = None
_lock       = threading.Lock()


def _get_clients():
    global _index, _oai
    if _index is None:
        with _lock:
            if _index is None:
                _oai   = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
                pc     = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
                _index = pc.Index(INDEX_NAME)
    return _index, _oai


def _embed(text: str) -> list[float]:
    _, oai = _get_clients()
    resp = oai.embeddings.create(model=EMBED_MODEL, input=[text])
    return resp.data[0].embedding


def _group_by_grn(matches: list, top_n: int) -> list[dict]:
    """Collapse multiple chunks per notice, keeping top_n distinct notices."""
    seen: dict[int, dict] = {}
    for m in matches:
        meta     = m["metadata"]
        grn      = int(meta["grn_number"])
        distance = 1.0 - m["score"]   # cosine similarity → distance
        if grn not in seen:
            seen[grn] = {**meta, "chunks": [], "best_distance": distance}
        seen[grn]["chunks"].append({
            "text":     meta.get("text", ""),
            "section":  meta.get("section", ""),
            "distance": distance,
        })
    grouped = sorted(seen.values(), key=lambda x: x["best_distance"])
    return grouped[:top_n]


def retrieve(query: str, top_notices: int = 3, chunks_per_status: int = 15) -> dict:
    """Query Pinecone separately for approved and withdrawn notices."""
    index, _ = _get_clients()
    vector   = _embed(query)

    approved_raw = index.query(
        vector=vector,
        top_k=chunks_per_status,
        filter={"status": {"$eq": "no_questions"}},
        include_metadata=True,
    )
    withdrawn_raw = index.query(
        vector=vector,
        top_k=chunks_per_status,
        filter={"status": {"$eq": "withdrawn"}},
        include_metadata=True,
    )

    return {
        "approved_notices":  _group_by_grn(approved_raw["matches"], top_notices),
        "withdrawn_notices": _group_by_grn(withdrawn_raw["matches"], top_notices),
    }


if __name__ == "__main__":
    TEST_QUERY = "dietary exposure methodology for precision fermentation derived protein"
    print(f"Query: {TEST_QUERY!r}\n")
    results = retrieve(TEST_QUERY, top_notices=3)
    for status_key, label in [("approved_notices", "APPROVED"), ("withdrawn_notices", "WITHDRAWN")]:
        print(f"--- {label} ---")
        for notice in results[status_key]:
            print(f"  GRN {notice['grn_number']} | {notice['substance_name']} | {notice['notifier']}")
            print(f"  Status: {notice['status']} | Best distance: {notice['best_distance']:.4f}")
            print()
