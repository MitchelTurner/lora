# LoRA Forge

Upload images, get a trained LoRA (.safetensors).

## Layout
```
apps/web            React + Vite + TS + Tailwind
apps/api            NestJS API (modules: auth, projects, uploads, dataset, training, webhooks, artifacts, providers)
apps/api/prisma     Prisma schema + migrations
workers/trainer     Python GPU worker (+ Dockerfile)
packages/shared     Shared TS types
```

## Local dev
```
cp .env.example .env
docker compose up -d     # Postgres, Redis, MinIO
npm install
npm run prisma:validate   # needs DATABASE_URL from .env
```
