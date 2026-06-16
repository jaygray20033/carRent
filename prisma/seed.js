// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ----- Roles -----
  const roles = [
    { code: 'CUSTOMER', name: 'Khách hàng' },
    { code: 'ADMIN', name: 'Quản trị viên' },
    { code: 'OPERATOR', name: 'Nhân viên vận hành' },
    { code: 'AGENT', name: 'Đại lý' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { code: r.code }, update: {}, create: r });
  }
  const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });

  // ----- Admin user -----
  const adminPass = await bcrypt.hash('Admin@1234', 10);
  await prisma.user.upsert({
    where: { phone: '0900000001' },
    update: {},
    create: {
      roleId: adminRole.id,
      fullName: 'System Admin',
      phone: '0900000001',
      email: 'admin@carrent.vn',
      passwordHash: adminPass,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  // ----- Demo customer -----
  const userPass = await bcrypt.hash('User@1234', 10);
  await prisma.user.upsert({
    where: { phone: '0901234567' },
    update: {},
    create: {
      roleId: customerRole.id,
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      email: 'user@carrent.vn',
      passwordHash: userPass,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  // ----- Brands -----
  const brandData = ['Toyota', 'Honda', 'Mazda', 'Hyundai', 'Kia', 'Ford', 'Mercedes', 'BMW'];
  for (const name of brandData) {
    await prisma.carBrand.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ----- Categories -----
  const catData = [
    { name: 'Sedan', slug: 'sedan' },
    { name: 'SUV', slug: 'suv' },
    { name: 'MPV', slug: 'mpv' },
    { name: 'Hatchback', slug: 'hatchback' },
    { name: 'Pickup', slug: 'pickup' },
  ];
  for (const c of catData) {
    await prisma.carCategory.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  // ----- Stations -----
  const stations = [
    { name: 'Trạm Hà Nội - Cầu Giấy', city: 'Hà Nội', district: 'Cầu Giấy', address: '123 Trần Duy Hưng', phone: '02412345678' },
    { name: 'Trạm TP.HCM - Quận 1', city: 'TP.HCM', district: 'Quận 1', address: '456 Lê Lợi', phone: '02834567890' },
    { name: 'Trạm Đà Nẵng', city: 'Đà Nẵng', district: 'Hải Châu', address: '789 Bạch Đằng', phone: '02363456789' },
  ];
  for (const s of stations) {
    const existing = await prisma.station.findFirst({ where: { name: s.name } });
    if (!existing) await prisma.station.create({ data: s });
  }

  // ----- Demo cars -----
  const toyota = await prisma.carBrand.findUnique({ where: { name: 'Toyota' } });
  const mazda = await prisma.carBrand.findUnique({ where: { name: 'Mazda' } });
  const sedan = await prisma.carCategory.findUnique({ where: { slug: 'sedan' } });
  const suv = await prisma.carCategory.findUnique({ where: { slug: 'suv' } });
  const station1 = await prisma.station.findFirst({ where: { city: 'Hà Nội' } });

  const demoCars = [
    {
      brandId: toyota.id, categoryId: sedan.id, stationId: station1.id,
      name: 'Toyota Vios 2023', slug: 'toyota-vios-2023', modelYear: 2023,
      licensePlate: '30A-12345', color: 'Trắng', seats: 5,
      transmission: 'AUTO', fuelType: 'GASOLINE', pricePerDay: 800000,
      description: 'Xe sedan tiết kiệm nhiên liệu, phù hợp gia đình.',
      thumbnailUrl: 'https://placehold.co/600x400?text=Toyota+Vios',
    },
    {
      brandId: toyota.id, categoryId: suv.id, stationId: station1.id,
      name: 'Toyota Fortuner 2024', slug: 'toyota-fortuner-2024', modelYear: 2024,
      licensePlate: '30A-67890', color: 'Đen', seats: 7,
      transmission: 'AUTO', fuelType: 'DIESEL', pricePerDay: 1800000,
      description: 'SUV 7 chỗ mạnh mẽ, phù hợp đi xa.',
      thumbnailUrl: 'https://placehold.co/600x400?text=Toyota+Fortuner',
    },
    {
      brandId: mazda.id, categoryId: sedan.id, stationId: station1.id,
      name: 'Mazda 3 2023', slug: 'mazda-3-2023', modelYear: 2023,
      licensePlate: '30A-11111', color: 'Đỏ', seats: 5,
      transmission: 'AUTO', fuelType: 'GASOLINE', pricePerDay: 900000,
      description: 'Sedan thiết kế đẹp, công nghệ hiện đại.',
      thumbnailUrl: 'https://placehold.co/600x400?text=Mazda+3',
    },
  ];
  for (const c of demoCars) {
    await prisma.car.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  console.log('✅ Seed done.');
  console.log('   - Admin login: phone=0900000001 / password=Admin@1234');
  console.log('   - User login : phone=0901234567 / password=User@1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
