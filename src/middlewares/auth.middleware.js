// ─────────────────────────────────────────────────────────────────────
//  src/middlewares/auth.middleware.js — JWT authentication
// ─────────────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import prisma from '../config/db.js';

/**
 * Middleware to verify JWT access token.
 * Sets req.user with the authenticated user object.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'fail',
        message: 'Access token is required. Please provide a valid Bearer token.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        roleId: true,
        status: true,
        role: { select: { code: true, name: true } },
      },
    });

    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not found or token is invalid.',
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        status: 'fail',
        message: 'Account is not active.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Access token has expired.',
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid access token.',
      });
    }
    next(error);
  }
}

export default { authenticate };
