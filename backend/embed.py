"""Embed GRAS chunks into ChromaDB using OpenAI text-embedding-3-small."""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
# .env uses OPEN_AI_KEY instead of OPENAI_API_KEY
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

import chromadb
from chromadb.utils import embedding_functions

CHUNKS_FILE = Path("data/chunks.jsonl")
NOTICES_DIRS = [Path("data/notices/Approved"), Path("data/notices/Withdrawn")]
CHROMA_DIR = Path("data/chroma")
COLLECTION_NAME = "gras_notices"
BATCH_SIZE = 20


def load_notice_metadata() -> dict[int, dict]:
    """Load per-notice JSON files, keyed by grn_number."""
    metadata: dict[int, dict] = {}
    for directory in NOTICES_DIRS:
        for json_path in directory.glob("*.json"):
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
                grn = data.get("grn_number")
                if grn:
                    metadata[int(grn)] = data
            except Exception as e:
                print(f"  Warning: could not load {json_path.name}: {e}")
    return metadata


def safe_str(value) -> str:
    """Convert any value to a ChromaDB-safe scalar string."""
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value)


def safe_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return bool(value)


def build_metadata(chunk: dict, notice: dict) -> dict:
    return {
        "grn_number": int(notice.get("grn_number") or chunk["grn_number"]),
        "substance_name": safe_str(notice.get("substance_name")),
        "notifier": safe_str(notice.get("notifier")),
        "date_filed": safe_str(notice.get("date_filed")),
        "date_closed": safe_str(notice.get("date_closed")),
        "status": safe_str(notice.get("status")),
        "substance_type": safe_str(notice.get("substance_type")),
        "production_method": safe_str(notice.get("production_method")),
        "source_organism_type": safe_str(notice.get("source_organism_type")),
        "intended_uses": safe_str(notice.get("intended_uses")),
        "target_population": safe_str(notice.get("target_population")),
        "gras_basis": safe_str(notice.get("gras_basis")),
        "safety_data_available": safe_str(notice.get("safety_data_available")),
        "dietary_exposure_method": safe_str(notice.get("dietary_exposure_method")),
        "exposure_estimate_included": safe_bool(notice.get("exposure_estimate_included")),
        "allergenicity_addressed": safe_bool(notice.get("allergenicity_addressed")),
        "source_pdf_url": safe_str(notice.get("source_pdf_url")),
        "section": safe_str(chunk.get("section")),
        "token_count": int(chunk.get("token_count", 0)),
    }


def run():
    print("Loading notice metadata...")
    notices = load_notice_metadata()
    print(f"  Loaded metadata for {len(notices)} notices")

    print("Loading chunks...")
    chunks = []
    with open(CHUNKS_FILE, encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if line:
                chunk = json.loads(line)
                chunk["chunk_id"] = f"grn{chunk['grn_number']}_{chunk.get('section', 'unknown')}_{i}"
                chunks.append(chunk)
    print(f"  Loaded {len(chunks)} chunks")

    print("Initialising ChromaDB...")
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    # Delete existing collection so re-runs start fresh
    try:
        client.delete_collection(COLLECTION_NAME)
        print(f"  Deleted existing '{COLLECTION_NAME}' collection")
    except Exception:
        pass

    ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=os.environ["OPENAI_API_KEY"],
        model_name="text-embedding-3-small",
    )
    collection = client.create_collection(COLLECTION_NAME, embedding_function=ef)
    print(f"  Created collection '{COLLECTION_NAME}'")

    print(f"Embedding {len(chunks)} chunks in batches of {BATCH_SIZE}...")
    skipped = 0
    for batch_start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[batch_start: batch_start + BATCH_SIZE]

        ids, documents, metadatas = [], [], []
        for chunk in batch:
            grn = int(chunk["grn_number"])
            notice = notices.get(grn, {})
            if not notice:
                skipped += 1
                continue
            ids.append(chunk["chunk_id"])
            documents.append(chunk.get("text", ""))
            metadatas.append(build_metadata(chunk, notice))

        if ids:
            for attempt in range(3):
                try:
                    collection.add(ids=ids, documents=documents, metadatas=metadatas)
                    break
                except Exception as exc:
                    if attempt == 2:
                        raise
                    print(f"\n  Batch error (attempt {attempt+1}/3): {exc} — retrying...")
                    import time; time.sleep(5)

        done = min(batch_start + BATCH_SIZE, len(chunks))
        print(f"  {done}/{len(chunks)} chunks embedded", end="\r")

    print(f"\nDone. {len(chunks) - skipped} chunks stored, {skipped} skipped (no matching notice JSON).")
    print(f"ChromaDB persisted at {CHROMA_DIR}")


if __name__ == "__main__":
    run()
