# JudgeFlow

Сервис для судейства одного организатора. Организатор входит по шестизначному коду из приложения-аутентификатора, создаёт мероприятие и выдаёт судьям персональные ссылки. Регистрации и учётных записей для нескольких организаторов нет.

## Как проходит мероприятие

1. Создайте черновик: команды, критерии и ссылки судей. При необходимости настройте внешний вид на странице редактирования.
2. Нажмите **«Начать оценивание»**. До этого судьи видят экран ожидания, а публичная страница не показывает результаты.
3. Судьи выставляют оценки. Страница результатов показывает предварительные места. Оценки сохраняются на устройстве и отправляются на сервер; судья видит состояние отправки.
4. Нажмите **«Завершить мероприятие»**. Подробные результаты откроются только после завершения. Если кому-то нужно исправить оценку, можно возобновить оценивание.

Судейская ссылка даёт доступ к оценкам конкретного судьи. Передавайте её только этому судье. Офлайн-оценка работает, пока уже открытая страница остаётся в браузере; обновление страницы без сети не поддерживается.

## Локальный запуск без Docker

Нужны Python 3.12, Node.js 20.9+ (или более новый LTS), PostgreSQL 15+ и Redis 7+. Запустите PostgreSQL и Redis обычным способом для вашей ОС и создайте пустую базу `judgeflow`.

```bash
createdb judgeflow
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

В `backend/.env` укажите `DATABASE_URL` для своего пользователя PostgreSQL, случайный `SECRET_KEY` длиной не менее 32 байт и `ORGANIZER_TOTP_SECRET` — Base32 ключ не менее 160 бит. Ключи можно сгенерировать так:

```bash
openssl rand -hex 32
python3 -c 'import base64,secrets; print(base64.b32encode(secrets.token_bytes(20)).decode())'
```

Добавьте `ORGANIZER_TOTP_SECRET` в приложение-аутентификатор как TOTP: 6 цифр, период 30 секунд, SHA-1. Сохраните ключ в безопасном месте: при его замене текущие сессии организатора станут недействительными. Не передавайте ключ судьям.

```bash
# В каталоге backend
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

В другом терминале:

```bash
cd frontend
cp .env.local.example .env.local
npm ci
npm run dev -- --webpack --hostname 127.0.0.1
```

Откройте `http://127.0.0.1:3000`. В `backend/.env` значение `FRONTEND_URL` должно совпадать с этим адресом. API работает на `127.0.0.1:8000`; `NEXT_PUBLIC_API_URL` и `NEXT_PUBLIC_WS_URL` в `frontend/.env.local` направляют туда запросы и WebSocket.

## Запуск через Docker Compose

```bash
cp .env.example .env
# Заполните POSTGRES_PASSWORD, SECRET_KEY, ORGANIZER_TOTP_SECRET
# Для публичного доступа укажите в FRONTEND_URL точный HTTPS адрес сервиса

docker compose up --build
```

Откройте `http://localhost` через Nginx. Для доступа по домену настройте HTTPS на внешнем прокси и `FRONTEND_URL=https://ваш-домен`; после смены адреса перезапустите API. Храните `.env` вне системы контроля версий. Настройте резервное копирование базы PostgreSQL и тома `uploads` до использования на реальном мероприятии.

## Проверки

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
npm audit

cd ../backend
.venv/bin/alembic current
.venv/bin/pip-audit -r requirements.txt  # если установлен pip-audit
```

Стек: FastAPI, PostgreSQL, Redis, Next.js, React, IndexedDB. HTTP API и live WebSocket проксируются Nginx в Docker; при локальном запуске фронтенд обращается к API напрямую.
