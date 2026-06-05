"""
One-time migration: embed all GRAS chunks into Pinecone.

Usage:
    python -m backend.embed_pinecone

Env vars required:
    OPENAI_API_KEY   (or OPEN_AI_KEY)
    PINECONE_API_KEY
    PINECONE_INDEX   (default: gras-notices)
"""

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec

CHUNKS_FILE   = Path("data/chunks.jsonl")
NOTICES_DIRS  = [Path("data/notices/Approved"), Path("data/notices/Withdrawn")]
INDEX_NAME    = os.environ.get("PINECONE_INDEX", "gras-notices")
EMBED_MODEL   = "text-embedding-3-small"
EMBED_DIM     = 1536
BATCH_EMBED   = 100   # OpenAI embedding batch size
BATCH_UPSERT  = 200   # Pinecone upsert batch size


def safe_str(v) -> str:
    if v is None: return ""
    if isinstance(v, list): return ", ".join(str(x) for x in v)
    return str(v)

def safe_bool(v) -> bool:
    return bool(v) if not isinstance(v, bool) else v


def load_notice_metadata() -> dict[int, dict]:
    metadata: dict[int, dict] = {}
    for directory in NOTICES_DIRS:
        for path in directory.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                grn = data.get("grn_number")
                if grn:
                    metadata[int(grn)] = data
            except Exception as e:
                print(f"  Warning: {path.name}: {e}")
    return metadata


def build_metadata(chunk: dict, notice: dict) -> dict:
    return {
        "grn_number":               int(notice.get("grn_number") or chunk["grn_number"]),
        "substance_name":           safe_str(notice.get("substance_name")),
        "notifier":                 safe_str(notice.get("notifier")),
        "date_filed":               safe_str(notice.get("date_filed")),
        "date_closed":              safe_str(notice.get("date_closed")),
        "status":                   safe_str(notice.get("status")),
        "substance_type":           safe_str(notice.get("substance_type")),
        "production_method":        safe_str(notice.get("production_method")),
        "source_organism_type":     safe_str(notice.get("source_organism_type")),
        "intended_uses":            safe_str(notice.get("intended_uses")),
        "target_population":        safe_str(notice.get("target_population")),
        "gras_basis":               safe_str(notice.get("gras_basis")),
        "safety_data_available":    safe_str(notice.get("safety_data_available")),
        "dietary_exposure_method":  safe_str(notice.get("dietary_exposure_method")),
        "exposure_estimate_included": safe_bool(notice.get("exposure_estimate_included")),
        "allergenicity_addressed":  safe_bool(notice.get("allergenicity_addressed")),
        "source_pdf_url":           safe_str(notice.get("source_pdf_url")),
        "section":                  safe_str(chunk.get("section")),
        "token_count":              int(chunk.get("token_count", 0)),
        "text":                     chunk.get("text", "")[:1000],  # store first 1000 chars for retrieval
    }


def run():
    oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    pc  = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

    # Create index if it doesn't exist
    existing = [i.name for i in pc.list_indexes()]
    if INDEX_NAME not in existing:
        print(f"Creating index '{INDEX_NAME}'...")
        pc.create_index(
            name=INDEX_NAME,
            dimension=EMBED_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        # Wait for index to be ready
        while not pc.describe_index(INDEX_NAME).status["ready"]:
            print("  Waiting for index to be ready...")
            time.sleep(5)
    else:
        print(f"Index '{INDEX_NAME}' already exists.")

    index = pc.Index(INDEX_NAME)

    print("Loading notice metadata...")
    notices = load_notice_metadata()
    print(f"  {len(notices)} notices loaded")

    print("Loading chunks...")
    chunks = []
    with open(CHUNKS_FILE, encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if line:
                chunk = json.loads(line)
                chunk["chunk_id"] = f"grn{chunk['grn_number']}_{chunk.get('section','unknown')}_{i}"
                chunks.append(chunk)
    print(f"  {len(chunks)} chunks loaded")

    # Filter to chunks that have matching notice metadata
    valid = [(c, notices[int(c["grn_number"])]) for c in chunks if int(c["grn_number"]) in notices]
    print(f"  {len(valid)} chunks with matching notice metadata")

    total   = len(valid)
    upsert_buffer = []
    done    = 0
    skipped = 0

    for batch_start in range(0, total, BATCH_EMBED):
        batch = valid[batch_start: batch_start + BATCH_EMBED]
        texts = [c["text"] for c, _ in batch]

        for attempt in range(3):
            try:
                resp = oai.embeddings.create(model=EMBED_MODEL, input=texts)
                break
            except Exception as e:
                if attempt == 2: raise
                print(f"\n  OpenAI error: {e} — retrying in 10s...")
                time.sleep(10)

        for (chunk, notice), emb_obj in zip(batch, resp.data):
            upsert_buffer.append({
                "id":     chunk["chunk_id"],
                "values": emb_obj.embedding,
                "metadata": build_metadata(chunk, notice),
            })

        # Upsert when buffer is large enough or at the end
        while len(upsert_buffer) >= BATCH_UPSERT:
            to_send = upsert_buffer[:BATCH_UPSERT]
            upsert_buffer = upsert_buffer[BATCH_UPSERT:]
            for attempt in range(3):
                try:
                    index.upsert(vectors=to_send)
                    break
                except Exception as e:
                    if attempt == 2: raise
                    print(f"\n  Pinecone error: {e} — retrying in 10s...")
                    time.sleep(10)

        done += len(batch)
        print(f"  {done}/{total} chunks embedded & queued", end="\r")

    # Flush remaining
    if upsert_buffer:
        index.upsert(vectors=upsert_buffer)

    print(f"\nDone. {done} chunks upserted to Pinecone index '{INDEX_NAME}'.")
    stats = index.describe_index_stats()
    print(f"Index stats: {stats}")


if __name__ == "__main__":
    run()
