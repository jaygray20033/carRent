# 🚗 CarRent Backend

Backend API cho hệ thống cho thuê xe ô tô (self-drive & with-driver) — phiên bản init.

## 🧱 Tech Stack
- **Runtime**: Node.js 20+
- **Framework**: Express.js 4
- **ORM**: Prisma 5
- **Database**: PostgreSQL 15+
- **Cache/Session**: Redis (optional)
- **Auth**: JWT (access + refresh) + bcryptjs
- **Validation**: Zod
- **Logger**: Winston + Morgan

## 📁 Folder Structure

```
carRent-be/
├── prisma/
│   ├── schema.prisma           # Prisma schema (User, Car, Booking, ...)
│   └── seed.js                 # Sample data
├── src/
│   ├── config/                 # env, db, redis, logger
│   ├── api/v1/                 # API modules (auth, users, cars, bookings, payments, stations)
│   │   └── <module>/
│   │       ├── *.routes.js
│   │       ├── *.controller.js
│   │       ├── *.service.js
│   │       └── *.validator.js
│   ├── middlewares/            # auth, rbac, validate, error
│   ├── utils/                  # apiResponse, apiError, jwt, password, constants
│   ├── integrations/           # sms, email, payment, storage (stubs)
│   ├── jobs/                   # background jobs (placeholder)
│   ├── app.js                  # Express app setup
│   └── server.js               # Entry point
├── .env.example
├── package.json
└── README.md
```

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup env
cp .env.example .env
# → chỉnh DATABASE_URL, JWT_SECRET

# 3. Generate Prisma client + chạy migration
npm run prisma:generate
npm run prisma:migrate

# 4. (Optional) Seed dữ liệu mẫu
npm run prisma:seed

# 5. Chạy dev server
npm run dev
```

Server chạy tại: `http://localhost:4000`
Base API URL: `http://localhost:4000/api/v1`

## 🔑 Core Endpoints (đã code)

### Auth
- `POST /api/v1/auth/register` — Đăng ký
- `POST /api/v1/auth/login` — Đăng nhập (trả access + refresh token)
- `POST /api/v1/auth/refresh-token` — Lấy access token mới
- `POST /api/v1/auth/logout` — Đăng xuất
- `POST /api/v1/auth/verify-otp` — Xác thực OTP (stub)

### User
- `GET /api/v1/users/me` — Profile hiện tại (auth)
- `PUT /api/v1/users/me` — Cập nhật profile (auth)

### Cars
- `GET /api/v1/cars` — Danh sách + filter (brand, category, priceMin, priceMax, transmission, fuel)
- `GET /api/v1/cars/:id` — Chi tiết xe
- `POST /api/v1/cars` — Tạo xe (admin)
- `PUT /api/v1/cars/:id` — Cập nhật xe (admin)
- `DELETE /api/v1/cars/:id` — Xóa xe (admin)

### Bookings
- `POST /api/v1/bookings` — Tạo đơn đặt xe (auth)
- `GET /api/v1/bookings` — Lịch sử đơn của user (auth)
- `GET /api/v1/bookings/:id` — Chi tiết đơn (auth)
- `PATCH /api/v1/bookings/:id/cancel` — Huỷ đơn (auth)

### Payments
- `POST /api/v1/payments/checkout` — Tạo phiên thanh toán (auth)
- `GET /api/v1/payments/:id` — Trạng thái thanh toán (auth)

### Stations
- `GET /api/v1/stations` — Danh sách điểm nhận/trả xe

## 📦 Response format

```json
// success
{ "success": true, "data": {...}, "message": "OK", "timestamp": "..." }
// error
{ "success": false, "message": "...", "code": "...", "errors": [...] }
```

## 🔐 Day 3 — Auth module (UC-01 / UC-02 / UC-03)

Hệ thống xác thực hoàn chỉnh: đăng ký + OTP, đăng nhập + khóa chống brute-force, xoay token.

### Endpoints (`/api/v1/auth`)
| Method | Path | Mô tả | Lỗi tiêu biểu |
|---|---|---|---|
| POST | `/register` | Tạo user **PENDING** + **Wallet**, sinh OTP 6 số (hash bcrypt → Redis TTL 5'), log OTP ra console | `409 PHONE_EXISTS` / `EMAIL_EXISTS`, `422 VALIDATION` |
| POST | `/login` | Trả access (15m) + refresh (7d) + profile. Lưu RefreshToken DB + Redis whitelist `rt:{userId}:{jti}` | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_LOCKED` / `ACCOUNT_PENDING` / `LOGIN_LOCKED` |
| POST | `/verify-otp` | bcrypt.compare OTP, attempts < 5 → ACTIVE; sai 5 lần khóa 30' | `422 OTP_INVALID`, `410 OTP_EXPIRED`, `403 OTP_LOCKED` |
| POST | `/resend-otp` | Gửi lại OTP, rate limit 60s/lần | `429 OTP_RESEND_COOLDOWN` |
| POST | `/refresh-token` | Xoay token, kiểm tra Redis whitelist, revoke jti cũ | `401 INVALID_REFRESH` / `REFRESH_REVOKED` |
| POST | `/logout` | Thu hồi refresh token khỏi whitelist | — |
| GET | `/me` | User hiện tại (Bearer access token) | `401 UNAUTHORIZED` |

### Quy tắc bảo mật
- Mật khẩu: bcrypt cost **12**. Password yêu cầu ≥ 8 ký tự, có **chữ + số**.
- OTP: lưu **hash bcrypt** trong Redis (không lưu plaintext); key `otp:{PURPOSE}:{identifier}` TTL 300s.
- Chống brute-force login: `login_fail:{identifier}` TTL 15', ≥ 5 → khóa 15' (`login_lock:{identifier}`).
- Chống brute-force OTP: ≥ 5 sai → khóa 30' (`otp_lock:{identifier}`).
- Refresh token whitelist Redis + lưu hash trong bảng `refresh_tokens`.

### Redis keys
```
otp:REGISTER:{phone}      -> { codeHash, attempts }  (TTL 5')
otp_resend:{identifier}   -> 1                        (TTL 60s)
otp_lock:{identifier}     -> 1                        (TTL 30')
login_fail:{identifier}   -> count                    (TTL 15')
login_lock:{identifier}   -> 1                        (TTL 15')
rt:{userId}:{jti}         -> 1                         (TTL 7d)
```

### Files
```
src/api/v1/auth/auth.validator.js   # zod: register/login/verifyOtp/resendOtp
src/api/v1/auth/auth.service.js     # business logic (register/login/verifyOtp/resendOtp/refresh/logout)
src/api/v1/auth/auth.controller.js  # 7 handlers (asyncHandler)
src/api/v1/auth/auth.routes.js      # routes + validate.middleware
src/integrations/redis.js           # ioredis singleton (REDIS_URL)
src/integrations/sms.js             # enqueueSendOtp() — log OTP ra console (DEV)
src/utils/otp.js                    # generateOtp / hashOtp / compareOtp
src/utils/jwt.js                    # signAccess/signRefresh(jti)/verify/durationToSeconds
src/utils/password.js               # hash/compare bcrypt
src/middlewares/auth.middleware.js  # parse Bearer -> req.user
```

### Test thủ công (happy path)
```bash
# 1) Register -> user PENDING, OTP in ra console server
curl -X POST localhost:4000/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"fullName":"Nguyen Van A","phone":"0912345678","email":"a@otorent.vn","password":"Passw0rd"}'
# 2) Lấy OTP từ console -> verify
curl -X POST localhost:4000/api/v1/auth/verify-otp -H 'Content-Type: application/json' \
  -d '{"identifier":"0912345678","code":"<OTP>","purpose":"REGISTER"}'
# 3) Login -> token
curl -X POST localhost:4000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"0912345678","password":"Passw0rd"}'
```
Postman collection: `../OtoRent.postman_collection.json` (folder **Auth**, 7 request).

### Yêu cầu hạ tầng khi chạy
- **MySQL/MariaDB** (DATABASE_URL) — đã `prisma migrate deploy` + `prisma:seed` (tạo role CUSTOMER).
- **Redis** (REDIS_URL) — bắt buộc cho OTP, login lock, refresh whitelist.

## 🛣️ Roadmap (chưa code)
- Wallet & wallet transactions
- Reviews & ratings
- Blog / CMS
- Coupon system
- Insurance packages
- Rescue requests
- Agent applications
- Notifications
- Admin dashboard endpoints
- Background jobs (BullMQ): email/SMS workers
- Real payment gateway integration (VNPay/Momo/ZaloPay)
- S3 upload middleware
- Full unit + integration tests
