# JudgeFlow — Platform for Studies/Judging

## Project Overview
Real-time event judging platform. Organizers create events with teams, criteria, and judges. Judges score via unique token links. Live leaderboard updates via WebSocket.

## Tech Stack
- **Backend**: FastAPI (Python 3.12), SQLAlchemy async, PostgreSQL 15, Redis 7 (PubSub)
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Zustand, Radix UI
- **Infra**: Docker Compose (db, redis, api, frontend, nginx), optional Cloudflare tunnel

## Project Structure
```
backend/
  app/
    main.py          # FastAPI app, lifespan (Redis init, WS listener)
    models.py        # SQLAlchemy models: User, Event, Team, Criterion, Score, JudgeToken
    schemas.py       # Pydantic request/response schemas
    auth.py          # JWT auth (organizer + judge tokens)
    config.py        # Settings (DATABASE_URL, REDIS_URL, SECRET_KEY, FRONTEND_URL)
    database.py      # Async SQLAlchemy engine/session
    redis_client.py  # Redis async client
    routers/
      auth.py        # Register, login, refresh
      events.py      # CRUD events, teams, criteria, judges, results, CSV export
      judge.py       # Judge auth, score submission (upsert + Redis publish)
      websocket.py   # WS endpoint + Redis PubSub listener → broadcast
  alembic/           # DB migrations
frontend/
  src/
    app/             # Next.js pages (auth, dashboard, events, scoring, live)
    lib/             # api.ts (Axios), offline-db.ts (IndexedDB), sync.ts, utils.ts
    stores/          # Zustand: auth-store.ts, judge-store.ts
    components/ui/   # Shadcn components
```

## Key Architecture Patterns
- **Real-time flow**: Judge saves score → API upserts to DB → publishes to Redis `event:{id}:scores` → redis_listener broadcasts to WS clients → live page updates
- **Offline support**: Scores saved to IndexedDB first, synced to server with debounce (1.5s)
- **Auth**: JWT tokens — organizer (60min access + 30d refresh), judge (30d access via token)
- **Scoring modes**: "team" (navigate teams, score all criteria) or "criterion" (navigate criteria, score all teams)

## Running
```bash
docker compose up --build        # Full stack
docker compose up -d             # Background
docker compose logs api -f       # API logs
```

## Commands
```bash
# Backend
cd backend && alembic upgrade head           # Run migrations
cd backend && alembic revision --autogenerate -m "description"  # New migration

# Frontend
cd frontend && npm run dev       # Dev mode
cd frontend && npm run build     # Production build
```

## Language
UI is in Russian. Code comments and API are in English.
