// src/middlewares/auth.middleware.js
import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/apiError.js';

export const authenticate = (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token) throw new UnauthorizedError('Missing access token');

    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      roleCode: payload.role,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(new UnauthorizedError('Token expired'));
    if (err.name === 'JsonWebTokenError') return next(new UnauthorizedError('Invalid token'));
    next(err);
  }
};
