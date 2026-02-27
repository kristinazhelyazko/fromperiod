/** @type {import('next').NextConfig} */
const API_BASE = process.env.API_BASE_URL || 'http://web:3000';

function normalizeApiBase(base) {
  if (!base) return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

const nextConfig = {
  async rewrites() {
    const base = normalizeApiBase(API_BASE);
    return [
      {
        source: '/api/:path*',
        destination: base + '/api/:path*',
      },
      // Только API прокидываем через backend; статику /elements раздаёт client_frontend сам
    ];
  },
};

module.exports = nextConfig;
