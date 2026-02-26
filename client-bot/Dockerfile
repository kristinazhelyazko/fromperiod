FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production
COPY client-bot ./client-bot
COPY bot/middleware ./bot/middleware
COPY utils ./utils
ENV NODE_ENV=production
CMD ["node","client-bot/index.js"]
