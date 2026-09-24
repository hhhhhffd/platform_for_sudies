# JudgeFlow

## 1. Краткое описание

JudgeFlow — веб-сервис для проведения конкурса или другого мероприятия с командами и несколькими судьями. Один организатор входит по одноразовому коду TOTP, настраивает критерии и команды, а каждому судье выдаётся персональная ссылка для оценки.

Сервис решает задачу сбора оценок без отдельных учётных записей судьям: API связывает оценки с мероприятиями и критериями, PostgreSQL хранит данные, Redis передаёт события об изменении оценок для обновления публичной таблицы результатов в реальном времени.

## 2. Технологический стек

- **Основное:** Python 3.12, FastAPI, Pydantic, SQLAlchemy 2 с async-драйвером `asyncpg`, Alembic; Next.js 16, React 19, TypeScript.
- **Данные:** PostgreSQL 15 хранит организатора, мероприятия, критерии, команды, судейские токены и оценки. Redis 7 используется для Pub/Sub уведомлений о новых оценках. IndexedDB хранит локальную очередь оценок судьи.
- **Аутентификация:** PyOTP (TOTP) для организатора; JWT в `HttpOnly` cookies организатора; персональные токены судей обмениваются на JWT, который используется в запросах судьи.
- **Инфраструктура:** Docker Compose, Nginx как reverse proxy, Gunicorn с Uvicorn workers для API. Cloudflare Tunnel доступен как необязательный профиль Compose.
- **AI/ML:** не используется. Итоговые баллы рассчитываются детерминированно как сумма средних оценок по критериям.

## 3. Архитектура

### Компоненты и поток данных

В Docker Compose браузер обращается к Nginx. Nginx направляет страницы в Next.js, REST-запросы в FastAPI, а соединения WebSocket — в тот же API. API проверяет аутентификацию и принадлежность оценок судье, затем выполняет операции с PostgreSQL. Redis распространяет уведомления о сохранённых оценках; API пересчитывает результаты и рассылает обновления подключённым страницам.

~~~mermaid
flowchart LR
    Organizer[Организатор]
    Judge[Судья]
    Audience[Зритель]
    Browser[Браузер]
    Frontend[Next.js и React]
    LocalDB[(IndexedDB)]
    Proxy[Nginx]
    API[FastAPI]
    DB[(PostgreSQL)]
    Redis[(Redis Pub/Sub)]
    Live[Страница результатов в браузере]

    Organizer --> Browser
    Judge --> Browser
    Audience --> Browser
    Browser -->|оценки без сети| LocalDB
    Browser -->|страницы, REST /api, WebSocket /ws| Proxy
    Proxy -->|страницы| Frontend
    Frontend -->|HTML и JavaScript| Browser
    Proxy -->|REST и WebSocket| API
    API <-->|чтение и запись| DB
    API -->|публикация score event| Redis
    Redis -->|уведомление| API
    API -->|WebSocket с пересчитанными результатами| Live
    LocalDB -->|повторная отправка после восстановления сети| Browser
~~~

### Вход и передача оценок

~~~mermaid
sequenceDiagram
    autonumber
    actor Organizer as Организатор
    participant Web as Next.js в браузере
    participant API as FastAPI
    participant DB as PostgreSQL
    actor Judge as Судья
    participant Redis as Redis Pub/Sub
    participant Live as Страница результатов

    Organizer->>Web: Вводит актуальный TOTP-код
    Web->>API: POST /api/auth/login
    API->>API: Проверяет 6-значный код и шаг TOTP
    API->>DB: Создаёт запись организатора при первом входе
    API->>DB: Сохраняет использованный шаг кода
    API-->>Web: Устанавливает HttpOnly access и refresh cookies

    Organizer->>Web: Создаёт мероприятие с командами и критериями
    Web->>API: POST /api/events
    API->>DB: Сохраняет мероприятие и создаёт персональные токены судей
    API-->>Web: Возвращает ссылки судьям и публичную ссылку

    Judge->>Web: Открывает персональную ссылку
    Web->>API: POST /api/judge/auth с токеном ссылки
    API->>DB: Проверяет токен и состояние судьи
    API-->>Web: Возвращает JWT судьи
    Judge->>Web: Выставляет оценки
    Web->>API: PUT /api/judge/scores
    API->>DB: Проверяет мероприятие, команду и критерий; сохраняет оценку
    API->>Redis: Публикует событие об изменении оценок
    Redis-->>API: Уведомляет слушателя Pub/Sub
    API->>DB: Пересчитывает средние оценки и итоговые баллы
    API-->>Live: Отправляет обновление через WebSocket
~~~

### Модель данных и жизненный цикл

- `Event` принадлежит единственному организатору и содержит критерии, команды и персональные `JudgeToken`.
- `Score` связывает мероприятие, команду, судью и критерий. Ограничение уникальности не позволяет создать две оценки одной командой одного судьи по одному критерию; новая отправка обновляет существующую оценку.
- В состоянии `draft` публичные результаты скрыты. В состоянии `active` доступны предварительные результаты. В состоянии `completed` открываются подробные результаты; организатор может возобновить оценивание.
- Судья может продолжить оценивание без сети, пока страница уже открыта: черновые оценки попадают в IndexedDB и отправляются на сервер после восстановления соединения. Перезагрузка страницы без сети не поддерживается.
- REST API и WebSocket работают в FastAPI. В Docker их проксирует Nginx по путям `/api/` и `/ws/`. При локальном запуске Next.js обращается напрямую к адресу API, заданному через `NEXT_PUBLIC_API_URL` и `NEXT_PUBLIC_WS_URL`.

### Архитектурные решения

1. **FastAPI и асинхронный SQLAlchemy.** Асинхронные обработчики используют `asyncpg` для PostgreSQL и поддерживают REST- и WebSocket-соединения в одном приложении.
2. **PostgreSQL как источник истины, Redis только для уведомлений.** Оценка сначала фиксируется в базе, после чего API публикует событие. Потеря уведомления не заменяет и не откатывает сохранённые данные.
3. **TOTP для единственного организатора, персональные ссылки для судей.** Это сохраняет простой сценарий доступа без регистрации пользователей. Судейская ссылка ограничивает доступ оценками конкретного судьи и мероприятия.

## 4. Запуск и настройка

### Требования

Для запуска через Compose нужны Docker Engine и Docker Compose v2. Compose загрузит образы PostgreSQL 15, Redis 7, Nginx и соберёт контейнеры API и Next.js. Для обычного запуска локально нужны Python 3.12, Node.js 20.9 или новее, PostgreSQL 15 и Redis 7.

### 4.1. Создать секреты и код входа

Перейдите в корень проекта и создайте три случайных значения. Для пароля PostgreSQL используйте hex-строку: Compose подставляет её в URL подключения API.

~~~bash
openssl rand -hex 32
openssl rand -hex 32
python3 -c 'import base64,secrets; print(base64.b32encode(secrets.token_bytes(20)).decode())'
~~~

- Результат первой команды задайте как `POSTGRES_PASSWORD`.
- Результат второй команды задайте как `SECRET_KEY`. Он должен содержать не менее 32 байт.
- Результат третьей команды задайте как `ORGANIZER_TOTP_SECRET`. Это Base32-ключ длиной 160 бит; он нужен приложению-аутентификатору и API.
- Храните все три секрета приватно. Не отправляйте их судьям, не публикуйте и не добавляйте в Git.

Затем создайте запись в приложении-аутентификаторе:

1. Откройте добавление учётной записи и выберите ручной ввод ключа настройки (setup key).
2. Вставьте значение `ORGANIZER_TOTP_SECRET`.
3. Выберите временный одноразовый пароль **TOTP**, алгоритм **SHA-1**, длину **6 цифр** и период **30 секунд**. Имя записи, например, `JudgeFlow — организатор`.
4. Приложение будет показывать меняющийся шестизначный код. Введите текущий код на странице входа JudgeFlow. Код скоро истекает и не должен использоваться повторно; при ошибке дождитесь следующего.
5. Сохраните резервную копию Base32-ключа в защищённом месте. При замене `ORGANIZER_TOTP_SECRET` ранее созданные сессии организатора станут недействительными.

Первая успешная проверка кода автоматически создаёт единственную учётную запись организатора. Отдельную регистрацию проходить не нужно.

При локальной разработке текущий код можно вывести в терминал вместо приложения-аутентификатора:

~~~bash
docker compose exec api python -c 'import os, pyotp; print(pyotp.TOTP(os.environ["ORGANIZER_TOTP_SECRET"]).now())'
~~~

Для запуска из виртуального окружения вместо Docker:

~~~bash
cd backend
.venv/bin/python -c 'from app.config import settings; import pyotp; print(pyotp.TOTP(settings.ORGANIZER_TOTP_SECRET).now())'
~~~

Запускайте эти команды только в локальной среде и не публикуйте их вывод. Это тот же одноразовый TOTP-код, который создаёт приложение-аутентификатор; он быстро истекает и не должен использоваться повторно.

### 4.2. Запуск всей системы через Docker Compose

Создайте рабочий файл окружения из шаблона:

~~~bash
cp .env.example .env
~~~

В `.env` сохраните значения проекта из шаблона и замените три демонстрационных секрета на созданные значения:

~~~dotenv
POSTGRES_DB=judgeflow
POSTGRES_USER=judgeflow
POSTGRES_PASSWORD=your_secure_password_here

SECRET_KEY=your_random_secret_key_here
ORGANIZER_TOTP_SECRET=your_base32_totp_secret_here
FRONTEND_URL=http://localhost
UPLOAD_DIR=uploads
ENV=production

LOG_LEVEL=INFO
LOG_FORMAT=json
CLOUDFLARE_TUNNEL_TOKEN=
~~~

`POSTGRES_DB`, `POSTGRES_USER`, `FRONTEND_URL`, `UPLOAD_DIR`, `ENV`, `LOG_LEVEL` и `LOG_FORMAT` показаны со значениями из `.env.example`. `POSTGRES_PASSWORD`, `SECRET_KEY` и `ORGANIZER_TOTP_SECRET` в шаблоне — только заполнители: обязательно замените их до запуска. Файл `.env` игнорируется Git.

В Compose каталог загрузок подключён к постоянному тому по пути `/app/uploads`; значение `UPLOAD_DIR=uploads` из файла показано как в шаблоне, но в контейнере API переопределяется. Настройки `ENV` и логирования в Compose остаются на значениях приложения по умолчанию: `production`, `INFO` и `json`.

Запустите сервисы:

~~~bash
docker compose up --build -d
docker compose ps
docker compose logs -f api
~~~

API при старте автоматически применяет миграции Alembic. PostgreSQL и Redis сначала проходят healthcheck; только затем запускается API. В Compose сервис базы называется `db`, поэтому API подключается к `db:5432`. Redis доступен внутри Compose-сети как `redis:6379`. Это внутренние DNS-имена контейнеров; для локального запуска вне Compose используйте `127.0.0.1`.

После старта откройте **http://localhost** — запросы проходят через Nginx на порту 80. Порты 3000 и 8000 нужны для прямого доступа к Next.js и API в локальной разработке; база и Redis наружу не публикуются.

Полезные команды:

~~~bash
docker compose logs -f api
docker compose logs -f frontend
docker compose restart api
docker compose down
~~~

`docker compose down` останавливает и удаляет контейнеры, сохраняя тома `pgdata` и `uploads`. Команда `docker compose down -v` удаляет также тома с базой и файлами; применяйте её только если хотите удалить данные.

### 4.3. Локальная разработка без Docker

Сначала запустите локальные PostgreSQL и Redis. Создайте пустую БД `judgeflow` от имени настроенной роли PostgreSQL:

~~~bash
createdb judgeflow
redis-cli ping
~~~

Команда Redis должна вернуть `PONG`. Затем подготовьте API:

~~~bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
~~~

В `backend/.env` укажите подключение к локальной БД и создайте секреты по разделу 4.1. Пример адресов для служб, запущенных на этой же машине:

~~~dotenv
DATABASE_URL=postgresql+asyncpg://localhost:5432/judgeflow
REDIS_URL=redis://127.0.0.1:6379/0
SECRET_KEY=<созданный-секрет>
ORGANIZER_TOTP_SECRET=<созданный-base32-ключ>
FRONTEND_URL=http://127.0.0.1:3000
ENV=development
~~~

Адрес `DATABASE_URL` повторяет значение из `backend/.env.example`; настройте его, если роль PostgreSQL, пароль или адрес сервера отличаются от локальных параметров по умолчанию. Создайте таблицы и запустите API:

~~~bash
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
~~~

Во втором терминале подготовьте фронтенд:

~~~bash
cd frontend
cp .env.local.example .env.local
npm ci
npm run dev -- --webpack --hostname 127.0.0.1
~~~

Шаблон `frontend/.env.local.example` направляет REST-запросы на `http://127.0.0.1:8000`, а WebSocket — на `ws://127.0.0.1:8000`. Откройте **http://127.0.0.1:3000** и войдите по коду из приложения-аутентификатора. Значение `FRONTEND_URL` в `backend/.env` должно точно совпадать с адресом фронтенда: оно используется для CORS, настроек cookies и формирования ссылок на судей.

### 4.4. Публичный HTTPS-доступ

В стандартной конфигурации Nginx слушает HTTP-порт 80. Для постоянного публичного адреса настройте TLS на внешнем reverse proxy или балансировщике и задайте точный внешний адрес, например `FRONTEND_URL=https://judge.example.org`. Это включает Secure-флаг cookies и задаёт базовый домен в ссылках.

Для временного Cloudflare Quick Tunnel запустите профиль:

~~~bash
docker compose --profile tunnel up -d
docker compose logs -f cloudflared
~~~

Скопируйте HTTPS-адрес из лога, задайте его в `FRONTEND_URL` и пересоздайте API. Quick Tunnel выдаёт временный адрес, поэтому после его смены обновите `FRONTEND_URL` ещё раз. Для постоянного Cloudflare Tunnel задайте токен в `CLOUDFLARE_TUNNEL_TOKEN`, настройте hostname в Cloudflare на origin `http://nginx:80` и запустите профиль `tunnel-token`.

После изменения `.env` пересоздайте API:

~~~bash
docker compose up -d --force-recreate api
~~~

Не публикуйте приложение через HTTP в недоверенной сети: персональные ссылки судей дают доступ к отправке оценок.

### 4.5. Сборка и проверки

~~~bash
cd frontend
npm run lint
npm run typecheck
npm run build

cd ../backend
.venv/bin/alembic current
~~~

Миграции можно повторно применить командой `.venv/bin/alembic upgrade head`. Перед реальным мероприятием настройте регулярное резервное копирование PostgreSQL и тома `uploads`.
