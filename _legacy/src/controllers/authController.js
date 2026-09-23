const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { success, error, created } = require('../utils/response');

/**
 * POST /api/v1/auth/register
 */
async function register(req, res, next) {
  try {
    const { email, password, full_name, phone, role } = req.body;

    if (!email || !password || !full_name) {
      return error(res, 'email, password, full_name are required', 400);
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return error(res, 'Email already registered', 409);
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password_hash,
      full_name,
      phone,
      role: role || 'USER',
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return created(res, {
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      token,
    }, 'Registration successful');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return error(res, 'email and password are required', 400);
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return error(res, 'Invalid credentials', 401);
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return error(res, 'Invalid credentials', 401);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return success(res, {
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      token,
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
