export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_SSL: process.env.DATABASE_SSL,
    NODE_ENV: process.env.NODE_ENV,
  });
}
