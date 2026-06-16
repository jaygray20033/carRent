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
