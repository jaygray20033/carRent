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
- Admin dashboard endpoints
- Background jobs (BullMQ): email/SMS workers
- Real payment gateway integration (VNPay/Momo/ZaloPay)
- S3 upload middleware
- Full unit + integration tests
