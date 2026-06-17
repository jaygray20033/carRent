// prisma/seed.js — Day 2 seed (MySQL)
// Seeds: 4 Roles, 1 Admin + 1 demo customer (+wallet), 2 InsurancePlan,
//        5 Brand, 3 Station, 5 SiteSetting, 1 InsurancePlan demo cars.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

async function main() {
  console.log('🌱 Seeding database (MySQL)...');

  // ----------------------------------------------------------------
  // 1) Roles: CUSTOMER, ADMIN, OPERATOR, AGENT
  // ----------------------------------------------------------------
  const roles = [
    { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
    { code: 'ADMIN', name: 'Quản trị viên', description: 'Toàn quyền hệ thống' },
    { code: 'OPERATOR', name: 'Nhân viên vận hành', description: 'Quản lý xe & đơn thuê' },
    { code: 'AGENT', name: 'Đại lý', description: 'Đối tác cung cấp xe' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { code: r.code }, update: { name: r.name, description: r.description }, create: r });
  }
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
  console.log('  ✓ Roles');

  // ----------------------------------------------------------------
  // 2) Admin user (from .env, password Admin@123)
  // ----------------------------------------------------------------
  const adminPhone = process.env.SEED_ADMIN_PHONE || '0900000001';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@carrent.vn';
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

  const adminHash = await bcrypt.hash('Admin@123', saltRounds);
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      roleId: adminRole.id,
      fullName: 'System Admin',
      phone: adminPhone,
      email: adminEmail,
      passwordHash: adminHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });
  await prisma.wallet.upsert({ where: { userId: admin.id }, update: {}, create: { userId: admin.id } });

  // Demo customer
  const userHash = await bcrypt.hash('User@123', saltRounds);
  const customer = await prisma.user.upsert({
    where: { phone: '0901234567' },
    update: {},
    create: {
      roleId: customerRole.id,
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      email: 'user@carrent.vn',
      passwordHash: userHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });
  await prisma.wallet.upsert({ where: { userId: customer.id }, update: {}, create: { userId: customer.id, balance: 500000 } });
  console.log('  ✓ Users + Wallets');

  // ----------------------------------------------------------------
  // 3) Insurance plans: Basic (free), Premium (10%)
  // ----------------------------------------------------------------
  const plans = [
    {
      code: 'BASIC',
      name: 'Bảo hiểm cơ bản',
      description: 'Gói bảo hiểm miễn phí đi kèm mọi chuyến thuê.',
      feePercent: 0,
      feeFlat: 0,
      coverage: 'Bảo hiểm trách nhiệm dân sự bắt buộc.',
    },
    {
      code: 'PREMIUM',
      name: 'Bảo hiểm cao cấp',
      description: 'Phụ thu 10% giá trị đơn, bảo hiểm vật chất toàn diện.',
      feePercent: 10,
      feeFlat: 0,
      coverage: 'Bảo hiểm vật chất xe + tai nạn người ngồi trên xe.',
    },
  ];
  for (const p of plans) {
    await prisma.insurancePlan.upsert({ where: { code: p.code }, update: p, create: p });
  }
  console.log('  ✓ Insurance plans');

  // ----------------------------------------------------------------
  // 4) Brands: Toyota, Honda, Mercedes, BMW, Hyundai
  // ----------------------------------------------------------------
  const brandNames = ['Toyota', 'Honda', 'Mercedes', 'BMW', 'Hyundai'];
  for (const name of brandNames) {
    await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
  }
  console.log('  ✓ Brands');

  // ----------------------------------------------------------------
  // 5) Stations: HCM, HN, DN
  // ----------------------------------------------------------------
  const stations = [
    { name: 'Trạm TP.HCM - Quận 1', city: 'TP.HCM', district: 'Quận 1', address: '456 Lê Lợi, Quận 1', phone: '02834567890' },
    { name: 'Trạm Hà Nội - Cầu Giấy', city: 'Hà Nội', district: 'Cầu Giấy', address: '123 Trần Duy Hưng, Cầu Giấy', phone: '02412345678' },
    { name: 'Trạm Đà Nẵng - Hải Châu', city: 'Đà Nẵng', district: 'Hải Châu', address: '789 Bạch Đằng, Hải Châu', phone: '02363456789' },
  ];
  for (const s of stations) {
    const existing = await prisma.station.findFirst({ where: { name: s.name } });
    if (!existing) await prisma.station.create({ data: s });
  }
  console.log('  ✓ Stations');

  // ----------------------------------------------------------------
  // 6) Site settings (hotline, email, address...)
  // ----------------------------------------------------------------
  const settings = [
    { key: 'site_hotline', value: '1900 1234', group: 'contact', label: 'Hotline' },
    { key: 'site_email', value: 'support@carrent.vn', group: 'contact', label: 'Email hỗ trợ' },
    { key: 'site_address', value: '456 Lê Lợi, Quận 1, TP.HCM', group: 'contact', label: 'Địa chỉ' },
    { key: 'site_name', value: 'CarRent', group: 'general', label: 'Tên website' },
    { key: 'site_facebook', value: 'https://facebook.com/carrent.vn', group: 'social', label: 'Facebook' },
  ];
  for (const st of settings) {
    await prisma.siteSetting.upsert({ where: { key: st.key }, update: { value: st.value }, create: st });
  }
  console.log('  ✓ Site settings');

  // ----------------------------------------------------------------
  // 7) Demo vehicles (optional convenience)
  // ----------------------------------------------------------------
  const toyota = await prisma.brand.findUnique({ where: { name: 'Toyota' } });
  const hyundai = await prisma.brand.findUnique({ where: { name: 'Hyundai' } });
  const station1 = await prisma.station.findFirst({ where: { city: 'TP.HCM' } });

  const demoCars = [
    {
      brandId: toyota.id, stationId: station1?.id ?? null,
      name: 'Toyota Vios 2023', slug: 'toyota-vios-2023', modelYear: 2023,
      licensePlate: '51A-12345', color: 'Trắng', seats: 5,
      transmission: 'AUTO', fuelType: 'GASOLINE', pricePerDay: 800000, depositAmount: 5000000,
      description: 'Xe sedan tiết kiệm nhiên liệu, phù hợp gia đình.',
      thumbnailUrl: 'https://placehold.co/600x400?text=Toyota+Vios',
    },
    {
      brandId: hyundai.id, stationId: station1?.id ?? null,
      name: 'Hyundai Santa Fe 2024', slug: 'hyundai-santafe-2024', modelYear: 2024,
      licensePlate: '51A-67890', color: 'Đen', seats: 7,
      transmission: 'AUTO', fuelType: 'DIESEL', pricePerDay: 1600000, depositAmount: 8000000,
      description: 'SUV 7 chỗ rộng rãi, phù hợp đi xa.',
      thumbnailUrl: 'https://placehold.co/600x400?text=Hyundai+SantaFe',
    },
  ];
  for (const c of demoCars) {
    await prisma.vehicle.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  console.log('  ✓ Demo vehicles');

  console.log('\n✅ Seed done.');
  console.log(`   - Admin login: phone=${adminPhone} / password=Admin@123`);
  console.log('   - User  login: phone=0901234567 / password=User@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
