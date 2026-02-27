require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3004',
  'http://localhost:3005',
  'https://fromperiod.ru',
  process.env.WEB_APP_URL && process.env.WEB_APP_URL.replace(/\/$/, ''),
  process.env.WEB_APP_CLIENT_URL && process.env.WEB_APP_CLIENT_URL.replace(/\/$/, ''),
  'https://web.telegram.org',
  'https://web.telegram.org/'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));
app.use('/elements', express.static('elements'));

app.get('/home.png', (req, res, next) => {
  const filePath = path.join(__dirname, 'home.png');
  res.sendFile(filePath, (err) => {
    if (err) {
      next(err);
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api', require('./routes/api'));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('API Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server only if not running as bot
function startServer(port, tries = 0) {
  const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && tries < 10) {
      const next = port + 1;
      logger.warn(`Port ${port} in use, trying ${next}`);
      startServer(next, tries + 1);
    } else {
      logger.error('Server start error', err);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = app;
