#!/bin/bash
set -e

echo "Building frontend..."
cd frontend
../node_modules/.bin/vite build
cd ..

echo "Starting server..."
uvicorn backend.api:app --host 0.0.0.0 --port 8000
