// tests/middlewareUtils.test.js — Unit tests for error/rbac middlewares + apiError (branch fill)
// Pure unit tests — no DB, no HTTP. Aim: tip overall branch coverage over 60%.
//
import { jest } from '@jest/globals';

const loggerMock = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
jest.unstable_mockModule('../src/config/logger.js', () => ({ default: loggerMock }));
jest.unstable_mockModule('../src/config/env.js', () => ({
  isProd: false,
  env: { JWT_ACCESS_SECRET: 'test', BCRYPT_SALT_ROUNDS: 10 },
  default: { JWT_ACCESS_SECRET: 'test', BCRYPT_SALT_ROUNDS: 10 },
}));

const {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  GoneError,
  UnprocessableError,
  TooManyRequestsError,
} = await import('../src/utils/apiError.js');
const { errorHandler, notFound } = await import('../src/middlewares/error.middleware.js');
const { authorize, requireRole } = await import('../src/middlewares/rbac.middleware.js');
const { success, created, paginated, fail } = await import('../src/utils/apiResponse.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('apiError constructors', () => {
  it('AppError carries status/code/details and is operational', () => {
    const e = new AppError('boom', 418, 'TEAPOT', { a: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('TEAPOT');
    expect(e.details).toEqual({ a: 1 });
    expect(e.isOperational).toBe(true);
  });

  it('specialized errors use the documented status codes', () => {
    expect(new NotFoundError('Car').statusCode).toBe(404);
    expect(new NotFoundError('Car').code).toBe('NOT_FOUND');
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new ConflictError('x', 'DUP').code).toBe('DUP');
    expect(new ValidationError([{ field: 'a' }]).statusCode).toBe(422);
    expect(new GoneError().statusCode).toBe(410);
    expect(new UnprocessableError('bad', 'X').code).toBe('X');
    expect(new TooManyRequestsError().statusCode).toBe(429);
  });
});

describe('errorHandler middleware', () => {
  it('serializes an AppError via fail()', () => {
    const res = mockRes();
    errorHandler(new NotFoundError('Vehicle'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'NOT_FOUND' })
    );
  });

  it('maps Prisma P2002 to 409 DUPLICATE', () => {
    const res = mockRes();
    errorHandler({ code: 'P2002', meta: { target: ['email'] } }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DUPLICATE' })
    );
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', () => {
    const res = mockRes();
    errorHandler({ code: 'P2025' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('falls back to 500 INTERNAL for unknown errors (dev shows message)', () => {
    const res = mockRes();
    errorHandler(new Error('kaboom'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL', message: 'kaboom' })
    );
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('notFound returns 404 for unknown routes', () => {
    const res = mockRes();
    notFound({ method: 'GET', originalUrl: '/nope' }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });
});

describe('RBAC middleware', () => {
  it('authorize: rejects missing user', () => {
    const next = jest.fn();
    authorize('ADMIN')({}, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('authorize: rejects wrong role', () => {
    const next = jest.fn();
    authorize('ADMIN')({ user: { roleCode: 'CUSTOMER' } }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('authorize: allows matching role (nested role.code)', () => {
    const next = jest.fn();
    authorize('ADMIN', 'OPERATOR')({ user: { role: { code: 'OPERATOR' } } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireRole: rejects missing user', () => {
    const next = jest.fn();
    requireRole(['ADMIN'])({}, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('requireRole: rejects wrong role', () => {
    const next = jest.fn();
    requireRole(['ADMIN'])({ user: { roleCode: 'CUSTOMER' } }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('requireRole: allows matching role; accepts a bare string', () => {
    const next = jest.fn();
    requireRole('ADMIN')({ user: { roleCode: 'ADMIN' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireRole: defaults to ADMIN when no roles passed', () => {
    const next = jest.fn();
    requireRole()({ user: { roleCode: 'ADMIN' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('apiResponse helpers', () => {
  it('success / created / paginated / fail produce the documented envelopes', () => {
    const res = mockRes();
    success(res, { a: 1 }, 'OK');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { a: 1 } })
    );

    created(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(201);

    paginated(res, [1, 2], { total: 2, page: 1, limit: 10 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        meta: expect.objectContaining({ total: 2, totalPages: 1 }),
      })
    );

    fail(res, 'nope', 400, 'BAD');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'BAD' })
    );
  });

  it('serializes BigInt fields to strings', () => {
    const res = mockRes();
    success(res, { n: 10n });
    const body = res.json.mock.calls[0][0];
    expect(body.data.n).toBe('10');
  });
});
