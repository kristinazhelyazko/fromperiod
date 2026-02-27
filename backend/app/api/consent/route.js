import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Файл с текстом согласия хранится в корне проекта pstock/save.txt
    const filePath = path.resolve(process.cwd(), '../save.txt');
    let text = '';

    try {
      text = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      text = '';
    }

    return Response.json({ text: text || '' });
  } catch (error) {
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

