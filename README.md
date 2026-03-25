# JudgeFlow

Платформа для проведения судейства мероприятий в реальном времени. Организаторы создают события с командами, критериями и судьями. Судьи оценивают через уникальные ссылки-токены. Лидерборд обновляется в реальном времени через WebSocket.

## Стек технологий

| Слой               | Технологии                                                                     |
| ------------------ | ------------------------------------------------------------------------------ |
| **Backend**        | FastAPI, Python 3.12, SQLAlchemy (async), PostgreSQL 15, Redis 7               |
| **Frontend**       | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Zustand, Radix UI |
| **Инфраструктура** | Docker Compose, Nginx, Cloudflare Tunnel                                       |

## Быстрый старт

### Требования

- Docker и Docker Compose

### Запуск

1. Скопируйте `.env.example` в `.env` и заполните переменные:

```bash
cp .env.example .env
```

Обязательные переменные:

- `POSTGRES_PASSWORD` — пароль PostgreSQL

- `SECRET_KEY` — секретный ключ для JWT
2. Запустите проект:

```bash
docker compose up --build
```

3. Откройте [http://localhost](http://localhost) в браузере.

### Публичный доступ через Cloudflare Tunnel

```bash
# Временная ссылка (бесплатно, без регистрации)
docker compose --profile tunnel up

# Кастомный домен (нужен токен)
CLOUDFLARE_TUNNEL_TOKEN=<token> docker compose --profile tunnel-token up
```

## Архитектура

```
┌──────────┐    ┌───────┐    ┌─────┐    ┌──────────┐    ┌───────┐
│ Frontend │◄──►│ Nginx │◄──►│ API │◄──►│ Postgres │    │ Redis │
│ Next.js  │    │       │    │ Fast│    │          │    │ PubSub│
└──────────┘    └───────┘    │ API │◄──►│          │    │       │
                             └──┬──┘    └──────────┘    └───┬───┘
                                │                           │
                                └───────────────────────────┘
                                    publish / subscribe
```

**Поток оценок в реальном времени:**
Судья ставит оценку → API сохраняет в БД → публикует в Redis → Redis listener рассылает по WebSocket → live-страница обновляется

**Офлайн-режим:**
Оценки сохраняются в IndexedDB и синхронизируются с сервером при восстановлении соединения.

## Структура проекта

```
backend/
  app/
    main.py            # FastAPI, lifespan (Redis, WS listener)
    models.py          # SQLAlchemy: User, Event, Team, Criterion, Score, JudgeToken
    schemas.py         # Pydantic-схемы
    auth.py            # JWT (организаторы + токены судей)
    config.py          # Настройки (DATABASE_URL, REDIS_URL, SECRET_KEY)
    database.py        # Async SQLAlchemy engine/session
    redis_client.py    # Redis async client
    routers/
      auth.py          # Регистрация, логин, обновление токенов
      events.py        # CRUD: события, команды, критерии, судьи, результаты, CSV
      judge.py         # Авторизация судьи, отправка оценок
      websocket.py     # WebSocket + Redis PubSub → broadcast
  alembic/             # Миграции БД
frontend/
  src/
    app/               # Страницы Next.js
    lib/               # API-клиент, IndexedDB, синхронизация
    stores/            # Zustand: auth, judge
    components/ui/     # Shadcn-компоненты
nginx/
  nginx.conf           # Проксирование API и фронтенда
docker-compose.yml     # Оркестрация всех сервисов
```

## Разработка

```bash
# Миграции БД
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Фронтенд в dev-режиме
cd frontend && npm run dev

# Логи API
docker compose logs api -f
```

## Лицензия

[MIT](LICENSE)
