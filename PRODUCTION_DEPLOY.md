# Продакшн‑деплой pstock

Этот файл описывает, как развернуть актуальную версию проекта в продакшене:

- бот для сотрудников (staff‑бот на Node.js),
- мини‑приложение для сотрудников (Node + старый фронт из public/),
- бот для клиентов (client‑bot),
- бэкенд приложения для клиентов (Next.js, каталог backend/),
- фронтенд приложения для клиентов (Next.js, каталог frontend/),
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

## 3. Обновление staff‑части (postgres + web + bot)

Файл docker-compose.yml описывает сервисы:

- postgres — PostgreSQL с volume pgdata,
- web — Node‑сервер server.js + статика из public/ (старое приложение для сотрудников),
- bot — бот для сотрудников (bot/index.js).

Пересобрать образы и обновить контейнеры:

```bash
docker compose build web bot
docker compose up -d web bot
```

Проверка:

```bash
docker compose ps
docker compose logs -f bot
docker compose logs -f web
```

База данных остаётся в том же состоянии (volume pgdata), схема обновляется миграциями.

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

## 5. Деплой бэкенда приложения для клиентов (backend/)

Бэкенд клиента — Next.js‑приложение в каталоге backend/, по умолчанию слушает порт 3001.

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

## 6. Деплой фронтенда приложения для клиентов (frontend/)

Фронтенд клиента живёт в каталоге frontend/ и по умолчанию слушает порт 3000. Чтобы не конфликтовать со staff‑web на 3000, удобно отдавать клиентский фронт на другом порту или отдельном домене.

### Вариант А: через Docker

```bash
cd /path/ocker build -t pstock-frontend .

docker run -d \
  --name pstock-frontend \
  -p 3002:3000 \
  pstock-frontend
```

Фронтенд будет доступен по http://<server-ip>:3002/. Для ботов в переменной WEB_APP_CLIENT_URL указываем HTTPS‑адрес (через nginx или другой прокси).

### Вариант Б: без Docker

```bash
cd /path/to/pstock/frontend
npm install
npm run start   # по умолчанию порт 3000
```

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
   - docker logs pstock-frontend,
   - pm2 logs client-bot (если используется pm2).

Если все проверки проходят, новая версия проекта (оба бота и клиентское приложение) успешно запущена и использует общую базу данных.
