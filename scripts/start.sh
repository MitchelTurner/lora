#!/bin/sh
set -e
case "$RAILWAY_SERVICE_NAME" in
  *web*)
    npm run start --workspace=@lora-forge/web
    ;;
  *)
    npm run start --workspace=@lora-forge/api
    ;;
esac
