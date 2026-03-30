# Продакшн‑деплой pstock

Этот файл описывает, как развернуть актуальную версию проекта в продакшене:

- бот для сотрудников (staff‑бот на Node.js),
- мини‑приложение для сотрудников (Node + фронт из public/; дополнительные API — Next.js в backend/),
- бот для клиентов (client‑бот),
- backend‑слой (Next.js, каталог backend/ — API для отчётов и служебных задач),
- фронтенд приложения для клиентов (Next.js, каталог frontend_client/),
- миграции и база данных PostgreSQL.

## 1. Подготовка сервера

1. Подключиться к серверу:

   ```bash
   ssh <user>@<server-ip>
   cd /path/to/pstock    # каталог с docker-compose.yml
   ```

2. Обновить код до последней версии:

   ```bash
   git fetch
   git pull origin main
   ```

3. Проверить/создать файл .env в корне проекта. Минимальный набор переменных:

   ```env
   # База данных
   POSTGRES_DB=pstock
   POSTGRES_USER=pstock
   POSTGRES_PASSWORD=<db_password>
   DATABASE_URL=postgresql://pstock:<db_password>@postgres:5432/pstock
   DATABASE_SSL=no

   # Бот для сотрудников
   TELEGRAM_BOT_TOKEN=<staff_bot_token>

   # Бот для клиентов
   TELEGRAM_CLIENT_BOT_TOKEN=<client_bot_token>

   # URL веб‑приложений
   WEB_APP_URL=https://<staff-app-domain>/
   WEB_APP_CLIENT_URL=https://<client-app-domain>/

   # Каналы
   ORDER_CHANNEL_ID=-100...
   ERROR_CHANNEL_ID=-100...
   ADMIN_CHANNEL_ID=-1003345446030
   ```

Токены и реальные ID каналов не должны попадать в Git, заполняем их только в .env на сервере.

## 2. Миграции базы данных

Миграции лежат в каталоге migrations/ и являются идемпотентными.

### Вариант А: через docker‑compose (сервис web)

```bash
docker compose run --rm web node migrations/run.js
```

### Вариант Б: напрямую на хосте

```bash
node migrations/run.js
```

При старте контейнеров web и bot миграции также выполняются автоматически, но явный запуск перед первым деплоем полезен для явной проверки.

## 3. Обновление staff‑части и включение клиентского приложения (postgres + web + bot + client_frontend)

Файл docker-compose.yml описывает сервисы:

- postgres — PostgreSQL с volume pgdata,
- web — Node‑сервер server.js + статика из public/ (приложение для сотрудников и API для клиентов),
- client_frontend — фронтенд приложения для клиентов (Next.js из каталога frontend_client/),
- bot — бот для сотрудников (bot/index.js).

### 3.1. Пересборка образов и обновление контейнеров

```bash
docker compose build web bot client_frontend
docker compose up -d web bot client_frontend
```

### 3.2. Проверка контейнеров

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f bot
docker compose logs -f client_frontend
```

База данных остаётся в том же состоянии (volume pgdata), схема обновляется миграциями.

### 3.3. Порты и URL в docker-compose.yml

По умолчанию в docker-compose.yml используются следующие маппинги портов:

- web: `3000:3000` — staff‑веб и API (Node server.js),
- client_frontend: `3002:3000` — клиентское приложение (Next.js).

Это означает:

- staff‑веб доступен по `http://<server-ip>:3000/`,
- клиентское приложение доступно по `http://<server-ip>:3002/` (или за reverse‑proxy/nginx).

В боте для клиентов используется переменная окружения `WEB_APP_CLIENT_URL` (в .env в корне проекта).
В продакшене она должна указывать **публичный HTTPS‑адрес** клиентского фронтенда, например:

```env
WEB_APP_CLIENT_URL=https://client.example.com/
```

Именно этот URL будет подставляться в кнопку «Перейти в приложение» в клиентском боте.

## 4. Деплой бота для клиентов (client-bot)

Исходники клиентского бота находятся в каталоге client-bot/, точка входа client-bot/index.js. Бот использует переменную TELEGRAM_CLIENT_BOT_TOKEN и отправляет пользователю кнопку перехода в клиентское приложение.

### Вариант А: отдельный контейнер Docker

В проекте есть Dockerfile для client-bot (client-bot/Dockerfile). Запуск:

```bash
cd /path/to/pstock
docker build -f client-bot/Dockerfile -t pstock-client-bot .

docker run -d \
  --name pstock-client-bot \
  --env-file .env \
  pstock-client-bot
```

Клиентский бот не обращается к базе данных, ему нужны только переменные окружения с токенами и URL.

### Вариант Б: запуск через pm2 без Docker

```bash
cd /path/to/pstock
npm install -g pm2   # один раз
pm2 start client-bot/index.js --name client-bot
pm2 save
```

Логи:

```bash
pm2 logs client-bot
```

## 5. Бэкенд‑слой (backend/)

Каталог backend/ содержит Next.js‑приложение, реализующее HTTP‑API для отчётов и служебных задач. 
Его можно разворачивать отдельно, если требуется вынести часть логики в отдельный сервис.

### Вариант А: через Docker

```bash
cd /path/to/pstock/backend
docker build -t pstock-backend .

docker run -d \
  --name pstock-backend \
  --env-file ../.env \
  --network pstock_default \
  -p 3001:3001 \
  pstock-backend
```

Сеть pstock_default — стандартная сеть docker‑compose (имя может отличаться, если проект называется иначе).

### Вариант Б: без Docker

```bash
cd /path/to/pstock/backend
npm install
npm run build
npm start   # слушает порт 3001
```

## 6. Next.js в каталоге backend/ (API и служебные маршруты)

Дополнительный Next.js‑слой в `backend/` используется для API (отчёты, каталог и т.д.), а не как замена staff‑интерфейса из `public/`. Сборка и запуск — как в разделе 5 выше (`backend/Dockerfile` или `npm run build` / `npm start` на хосте).

## 7. Быстрая проверка после деплоя

1. Бот для сотрудников:
   - отправить команду /start,
   - авторизоваться админом,
   - проверить главное меню и управление заказами.

2. Бот для клиентов:
   - отправить /start в клиентский бот,
   - убедиться, что кнопка «Перейти в приложение» ведёт на правильный WEB_APP_CLIENT_URL.

3. Клиентское приложение:
   - открыть фронтенд (домен или http://<server-ip>:3002/),
   - проверить загрузку товаров и адресов.

4. Логи:
   - docker compose logs -f bot web,
   - docker logs pstock-backend,
   - при отдельном контейнере Next из backend/ — соответствующие `docker logs`,
   - pm2 logs client-bot (если используется pm2).

Если все проверки проходят, новая версия проекта (оба бота и клиентское приложение) успешно запущена и использует общую базу данных.
