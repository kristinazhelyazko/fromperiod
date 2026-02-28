/**
 * Синхронизирует папку "elements" с catalog_item:
 * для каждого файла изображения: name = имя файла без расширения,
 * image_path = '/elements/' + точное имя файла (UTF-8 без потери символов).
 * Если запись с таким image_path есть — обновляется name, иначе — вставка.
 * (Файлы из "new elements" нужно предварительно скопировать в "elements" на хосте.)
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const ROOT = path.join(__dirname, '..');
const ELEMENTS_DIR = path.join(ROOT, 'elements');

async function run() {
  if (!fs.existsSync(ELEMENTS_DIR)) {
    console.error('Папка "elements" не найдена:', ELEMENTS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(ELEMENTS_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
  if (files.length === 0) {
    console.log('В "elements" нет файлов изображений.');
    process.exit(0);
  }

  console.log(`Синхронизация ${files.length} файлов из "elements" в catalog_item...`);
  for (const file of files) {
    const imagePath = '/elements/' + file;
    const name = path.basename(file, path.extname(file));

    const existing = await pool.query(
      'SELECT id FROM catalog_item WHERE image_path = $1',
      [imagePath]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE catalog_item SET name = $1 WHERE image_path = $2',
        [name, imagePath]
      );
      console.log('  Обновлено:', name, '->', imagePath);
    } else {
      await pool.query(
        'INSERT INTO catalog_item (name, price, image_path) VALUES ($1, 0, $2)',
        [name, imagePath]
      );
      console.log('  Добавлено:', name, '->', imagePath);
    }
  }

  console.log('Готово.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
