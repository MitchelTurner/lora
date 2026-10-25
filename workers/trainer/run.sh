#!/bin/sh
set -e
cd "$(dirname "$0")"
if [ -z "${WORKER_TOKEN}" ]; then
  echo "Set WORKER_TOKEN to the same value as on the LoRA Forge API service." >&2
  exit 1
fi
exec python3 -m trainer
