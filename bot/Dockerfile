FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production
COPY bot ./bot
COPY services ./services
COPY config ./config
COPY utils ./utils
COPY migrations ./migrations
COPY routes ./routes
COPY public ./public
COPY elements ./elements
ENV NODE_ENV=production
CMD ["node","bot/index.js"]
