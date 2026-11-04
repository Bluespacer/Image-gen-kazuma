#!/usr/bin/env bash
# Start mock ComfyUI, mock LLM and the dev SillyTavern (http://127.0.0.1:8000). Ctrl+C stops all.
set -euo pipefail
cd "$(dirname "$0")"
node mock-comfy.mjs 8188 & node mock-llm.mjs 5001 &
trap 'kill $(jobs -p) 2>/dev/null' EXIT
cd SillyTavern && node server.js --port 8000 --listen false
