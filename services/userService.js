const pool = require('../config/database');
const { comparePassword, hashPassword } = require('../utils/password');
const logger = require('../utils/logger');

async function findUserByLogin(login) {
  try {
    const result = await pool.query(
      'SELECT u.id, u.login, u.password, u.rights_id, r.name as rights_name FROM users u JOIN rights r ON u.rights_id = r.id WHERE u.login = $1',
      [login]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error finding user by login:', error);
    throw error;
  }
}

async function verifyPassword(user, password) {
  try {
    const upw = user && typeof user.password === 'string' ? user.password : '';
    if (upw.startsWith('$2')) {
      try {
        const ok = await comparePassword(password, upw);
        if (ok) return true;
      } catch (_) {
      }
    }
    return password === upw;
  } catch (error) {
    logger.error('Error verifying password:', error);
    return false;
  }
}

async function createUser(login, password, rightsId) {
  try {
    const hashed = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (login, password, rights_id) VALUES ($1, $2, $3) RETURNING id, login, rights_id',
      [login, hashed, rightsId]
    );
    logger.info(`User created: ${login}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating user:', error);
    throw error;
  }
}

async function getAllRights() {
  try {
    const result = await pool.query("SELECT id, name FROM rights WHERE name <> 'разработчик' ORDER BY id");
    return result.rows;
  } catch (error) {
    logger.error('Error getting rights:', error);
    throw error;
  }
}

async function listAllUsers() {
  try {
    const result = await pool.query(
      'SELECT u.id, u.login, u.rights_id, r.name as rights_name FROM users u JOIN rights r ON u.rights_id = r.id ORDER BY u.login'
    );
    return result.rows;
  } catch (error) {
    logger.error('Error listing users:', error);
    throw error;
  }
}

async function updateUserPassword(userId, newPassword) {
  try {
    const hashed = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password = $2 WHERE id = $1', [userId, hashed]);
    logger.info(`Password updated for user id=${userId}`);
    return true;
  } catch (error) {
    logger.error('Error updating user password:', error);
    throw error;
  }
}

async function deleteUser(userId) {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    logger.info(`User deleted id=${userId}`);
    return true;
  } catch (error) {
    logger.error('Error deleting user:', error);
    throw error;
  }
}

async function updateUserRights(userId, rightsId) {
  try {
    await pool.query('UPDATE users SET rights_id = $2 WHERE id = $1', [userId, rightsId]);
    logger.info(`Rights updated for user id=${userId} to rightsId=${rightsId}`);
    return true;
  } catch (error) {
    logger.error('Error updating user rights:', error);
    throw error;
  }
}

async function findRightsIdByName(name) {
  try {
    const result = await pool.query('SELECT id FROM rights WHERE name = $1', [name]);
    return result.rows[0] ? result.rows[0].id : null;
  } catch (error) {
    logger.error('Error finding rights by name:', error);
    throw error;
  }
}

module.exports = {
  findUserByLogin,
  verifyPassword,
  createUser,
  getAllRights,
  listAllUsers,
  updateUserPassword,
  deleteUser,
  updateUserRights,
  findRightsIdByName,
};

