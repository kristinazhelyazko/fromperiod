require('dotenv').config();
const pool = require('../config/database');
const { hashPassword } = require('../utils/password');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    console.log('Создание пользователя...\n');

    // Проверяем подключение к БД
    await pool.query('SELECT 1');
    console.log('✓ Подключение к базе данных установлено\n');

    // Выбор роли
    const roleChoice = await question('Выберите роль: 1 - администратор, 2 - разработчик: ');
    const roleName = String(roleChoice).trim() === '2' ? 'разработчик' : 'администратор';
    const rightsRes = await pool.query('SELECT id FROM rights WHERE name = $1', [roleName]);
    if (rightsRes.rows.length === 0) {
      console.error(`❌ Право "${roleName}" не найдено в базе данных. Запустите миграции: npm run migrate`);
      process.exit(1);
    }
    const rightsId = rightsRes.rows[0].id;

    // Запрашиваем данные
    const login = await question('Введите логин: ');
    if (!login || login.trim() === '') {
      console.error('❌ Логин не может быть пустым');
      process.exit(1);
    }

    // Проверяем, не существует ли уже пользователь с таким логином
    const existingUser = await pool.query('SELECT id FROM users WHERE login = $1', [login.trim()]);
    if (existingUser.rows.length > 0) {
      console.error('❌ Пользователь с таким логином уже существует');
      process.exit(1);
    }

    const password = await question('Введите пароль: ');
    if (!password || password.trim() === '') {
      console.error('❌ Пароль не может быть пустым');
      process.exit(1);
    }

    // Хешируем пароль и создаем пользователя
    const hashedPassword = await hashPassword(password);
    const result = await pool.query('INSERT INTO users (login, password, rights_id) VALUES ($1, $2, $3) RETURNING id, login', [login.trim(), hashedPassword, rightsId]);

    console.log(`\n✅ Пользователь "${result.rows[0].login}" (${roleName}) успешно создан!`);
    console.log(`   ID: ${result.rows[0].id}`);
    
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при создании администратора:', error.message);
    rl.close();
    process.exit(1);
  }
}

createAdmin();


