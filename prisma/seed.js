// prisma/seed.js — CarGoGo seed data (MySQL)
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

// Static /uploads assets are served by the API, so brand logos need an absolute
// URL (same convention as storage.js) — a relative "/uploads/.." would resolve
// against the FE origin (:3000) and 404.
const APP_URL = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// The real ADMIN account is the only credential that must never ship with a
// public default. It's read from env so prod can pass a strong password via
// SEED_ADMIN_PASSWORD; dev falls back to the well-known demo password. Phone /
// email are overridable too so prod isn't forced onto the demo identity.
const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE || '0900000001';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@CarGoGo.vn';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';

async function main() {
  console.log('🌱 Seeding database (MySQL)...');

  // 1) Roles
  const roles = [
    { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
    { code: 'ADMIN', name: 'Quản trị viên', description: 'Toàn quyền hệ thống' },
    { code: 'OPERATOR', name: 'Nhân viên vận hành', description: 'Quản lý xe & đơn thuê' },
    { code: 'AGENT', name: 'Đại lý', description: 'Đối tác cung cấp xe' },
    { code: 'SUPPLIER_ADMIN', name: 'Quản trị nhà cung cấp', description: 'Quản lý member, nhận đơn dispatch, gán tài xế' },
    { code: 'SUPPLIER_DRIVER', name: 'Tài xế nhà cung cấp', description: 'Xem chuyến được gán, start/complete, điền thông tin' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { code: r.code }, update: {}, create: r });
  }
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
  const supplierAdminRole = await prisma.role.findUnique({ where: { code: 'SUPPLIER_ADMIN' } });
  const supplierDriverRole = await prisma.role.findUnique({ where: { code: 'SUPPLIER_DRIVER' } });
  console.log('  ✓ Roles');

  // 2) Users
  const saltRounds = 12;
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);
  await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    // Re-seeding prod must roll the password/email forward to the env values,
    // otherwise a stale demo password could linger on an existing admin row.
    update: { passwordHash: adminHash, email: ADMIN_EMAIL, status: 'ACTIVE' },
    create: {
      roleId: adminRole.id,
      fullName: 'System Admin',
      phone: ADMIN_PHONE,
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  const userHash = await bcrypt.hash('User@123', saltRounds);
  const customer = await prisma.user.upsert({
    where: { phone: '0901234567' },
    update: {},
    create: {
      roleId: customerRole.id,
      fullName: 'Nguyễn Khánh Vân',
      phone: '0901234567',
      email: 'nkv@gmail.com',
      passwordHash: userHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });
  await prisma.wallet.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id, balance: 500000 },
  });
  console.log('  ✓ Users + Wallets');

  // 3) Categories
  const categories = [
    { name: 'Sedan', slug: 'sedan', icon: 'sedan' },
    { name: 'SUV', slug: 'suv', icon: 'suv' },
    { name: 'Thể thao', slug: 'the-thao', icon: 'sport' },
    { name: 'Mui Trần', slug: 'mui-tran', icon: 'convertible' },
    { name: 'Coupe', slug: 'coupe', icon: 'coupe' },
    { name: 'MPV', slug: 'mpv', icon: 'mpv' },
    { name: 'Hatchback', slug: 'hatchback', icon: 'hatchback' },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  console.log('  ✓ Categories');

  // 4) Brands with logos
  const brands = [
    {
      name: 'BMW',
      slug: 'bmw',
      logoUrl: `${APP_URL}/uploads/brands/bmw.png`,
      country: 'Germany',
    },
    {
      name: 'Mercedes',
      slug: 'mercedes',
      logoUrl: `${APP_URL}/uploads/brands/mercedes.png`,
      country: 'Germany',
    },
    {
      name: 'Lexus',
      slug: 'lexus',
      logoUrl: `${APP_URL}/uploads/brands/lexus.png`,
      country: 'Japan',
    },
    {
      name: 'Toyota',
      slug: 'toyota',
      logoUrl: `${APP_URL}/uploads/brands/toyota.svg`,
      country: 'Japan',
    },
    {
      name: 'Hyundai',
      slug: 'hyundai',
      logoUrl: `${APP_URL}/uploads/brands/hyundai.png`,
      country: 'South Korea',
    },
    {
      name: 'Peugeot',
      slug: 'peugeot',
      logoUrl: `${APP_URL}/uploads/brands/peugeot.png`,
      country: 'France',
    },
    {
      name: 'Kia',
      slug: 'kia',
      logoUrl: `${APP_URL}/uploads/brands/kia.png`,
      country: 'South Korea',
    },
    {
      name: 'Porsche',
      slug: 'porsche',
      logoUrl: `${APP_URL}/uploads/brands/porsche.png`,
      country: 'Germany',
    },
    {
      name: 'Audi',
      slug: 'audi',
      logoUrl: `${APP_URL}/uploads/brands/audi.png`,
      country: 'Germany',
    },
    {
      name: 'Ford',
      slug: 'ford',
      logoUrl: `${APP_URL}/uploads/brands/ford.png`,
      country: 'USA',
    },
  ];
  for (const b of brands) {
    await prisma.brand.upsert({
      where: { slug: b.slug },
      update: { logoUrl: b.logoUrl, country: b.country },
      create: b,
    });
  }
  console.log('  ✓ Brands');

  // 5) Stations
  const stations = [
    {
      name: 'CarGoGo HQ - Quận 2',
      type: 'HQ',
      city: 'TP. Hồ Chí Minh',
      district: 'Quận 2',
      address: '55 Đặng Nhữ Mai, Phường Cát Lái, TP.HCM',
      phone: '0986310849',
      latitude: 10.786,
      longitude: 106.746,
    },
    {
      name: 'Sân bay Tân Sơn Nhất',
      type: 'AIRPORT',
      city: 'TP. Hồ Chí Minh',
      district: 'Tân Bình',
      address: 'Nhà Ga Quốc Nội, TSN',
      phone: '0283456789',
      latitude: 10.818,
      longitude: 106.651,
    },
    {
      name: 'Sân bay Nội Bài',
      type: 'AIRPORT',
      city: 'Hà Nội',
      district: 'Sóc Sơn',
      address: 'Nhà Ga T1, Nội Bài',
      phone: '0241234567',
      latitude: 21.221,
      longitude: 105.807,
    },
    {
      name: 'Trạm Hà Nội - Cầu Giấy',
      type: 'CITY',
      city: 'Hà Nội',
      district: 'Cầu Giấy',
      address: '123 Trần Duy Hưng, Cầu Giấy',
      phone: '0241234568',
      latitude: 21.02,
      longitude: 105.796,
    },
    {
      name: 'Trạm Đà Nẵng - Hải Châu',
      type: 'CITY',
      city: 'Đà Nẵng',
      district: 'Hải Châu',
      address: '789 Bạch Đằng, Hải Châu',
      phone: '02363456789',
      latitude: 16.065,
      longitude: 108.22,
    },
  ];
  for (const s of stations) {
    const existing = await prisma.station.findFirst({ where: { name: s.name } });
    if (!existing) await prisma.station.create({ data: s });
  }
  console.log('  ✓ Stations');

  // 6) Vehicle Models
  const bmw = await prisma.brand.findUnique({ where: { slug: 'bmw' } });
  const mercedes = await prisma.brand.findUnique({ where: { slug: 'mercedes' } });
  const lexus = await prisma.brand.findUnique({ where: { slug: 'lexus' } });
  const toyota = await prisma.brand.findUnique({ where: { slug: 'toyota' } });
  const hyundai = await prisma.brand.findUnique({ where: { slug: 'hyundai' } });
  const porsche = await prisma.brand.findUnique({ where: { slug: 'porsche' } });
  const ford = await prisma.brand.findUnique({ where: { slug: 'ford' } });

  const sedanCat = await prisma.category.findUnique({ where: { slug: 'sedan' } });
  const suvCat = await prisma.category.findUnique({ where: { slug: 'suv' } });
  const sportCat = await prisma.category.findUnique({ where: { slug: 'the-thao' } });
  const _coupeCat = await prisma.category.findUnique({ where: { slug: 'coupe' } });

  const vehicleModels = [
    {
      brandId: mercedes.id,
      categoryId: sedanCat.id,
      name: 'C300',
      slug: 'mercedes-c300',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
    },
    {
      brandId: mercedes.id,
      categoryId: suvCat.id,
      name: 'GLC 300',
      slug: 'mercedes-glc-300',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
    },
    {
      brandId: bmw.id,
      categoryId: sedanCat.id,
      name: '320i',
      slug: 'bmw-320i',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
    },
    {
      brandId: bmw.id,
      categoryId: suvCat.id,
      name: 'X5',
      slug: 'bmw-x5',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'DIESEL',
    },
    {
      brandId: lexus.id,
      categoryId: sedanCat.id,
      name: 'ES 250',
      slug: 'lexus-es-250',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
    },
    {
      brandId: toyota.id,
      categoryId: sedanCat.id,
      name: 'Camry',
      slug: 'toyota-camry',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
    },
    {
      brandId: toyota.id,
      categoryId: suvCat.id,
      name: 'Fortuner',
      slug: 'toyota-fortuner',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'DIESEL',
    },
    {
      brandId: hyundai.id,
      categoryId: suvCat.id,
      name: 'Santa Fe',
      slug: 'hyundai-santa-fe',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'DIESEL',
    },
    {
      brandId: porsche.id,
      categoryId: sportCat.id,
      name: 'Cayenne',
      slug: 'porsche-cayenne',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
    },
    {
      brandId: ford.id,
      categoryId: suvCat.id,
      name: 'Explorer',
      slug: 'ford-explorer',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
    },
  ];
  for (const m of vehicleModels) {
    await prisma.vehicleModel.upsert({ where: { slug: m.slug }, update: {}, create: m });
  }
  console.log('  ✓ Vehicle Models');

  // 7) Demo Vehicles
  const station1 = await prisma.station.findFirst({ where: { type: 'HQ' } });
  const station2 = await prisma.station.findFirst({
    where: { type: 'AIRPORT', city: 'TP. Hồ Chí Minh' },
  });
  const mercedesC300Model = await prisma.vehicleModel.findUnique({
    where: { slug: 'mercedes-c300' },
  });
  const mercedesGLCModel = await prisma.vehicleModel.findUnique({
    where: { slug: 'mercedes-glc-300' },
  });
  const bmw320iModel = await prisma.vehicleModel.findUnique({ where: { slug: 'bmw-320i' } });
  const bmwX5Model = await prisma.vehicleModel.findUnique({ where: { slug: 'bmw-x5' } });
  const lexusModel = await prisma.vehicleModel.findUnique({ where: { slug: 'lexus-es-250' } });
  const toyotaCamryModel = await prisma.vehicleModel.findUnique({
    where: { slug: 'toyota-camry' },
  });
  const fortunerModel = await prisma.vehicleModel.findUnique({
    where: { slug: 'toyota-fortuner' },
  });
  const santaFeModel = await prisma.vehicleModel.findUnique({
    where: { slug: 'hyundai-santa-fe' },
  });
  const cayenneModel = await prisma.vehicleModel.findUnique({ where: { slug: 'porsche-cayenne' } });
  const explorerModel = await prisma.vehicleModel.findUnique({ where: { slug: 'ford-explorer' } });

  const demoVehicles = [
    {
      brandId: mercedes.id,
      modelId: mercedesC300Model.id,
      categoryId: sedanCat.id,
      stationId: station1?.id,
      name: 'MERCEDES C300 2024',
      slug: 'mercedes-c300-2024-1',
      modelYear: 2024,
      licensePlate: '51A-111.01',
      color: 'Trắng',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 8500000,
      pricePerMonth: 180000000,
      depositAmount: 40000000,
      description: 'Sedan hạng sang Mercedes C300 AMG đời mới nhất.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=600&h=400&fit=crop',
      rating: 4.8,
      reviewCount: 32,
      isFeatured: true,
      featuredTag: 'XE_DOI_MOI',
    },
    {
      brandId: mercedes.id,
      modelId: mercedesC300Model.id,
      categoryId: sedanCat.id,
      stationId: station1?.id,
      name: 'MERCEDES C300 2024',
      slug: 'mercedes-c300-2024-2',
      modelYear: 2024,
      licensePlate: '51A-111.02',
      color: 'Đen',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 8500000,
      pricePerMonth: 180000000,
      depositAmount: 40000000,
      description: 'Sedan hạng sang Mercedes C300 AMG đời mới nhất.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=600&h=400&fit=crop',
      rating: 4.7,
      reviewCount: 28,
      isFeatured: true,
      featuredTag: 'XE_SANG',
    },
    {
      brandId: mercedes.id,
      modelId: mercedesGLCModel.id,
      categoryId: suvCat.id,
      stationId: station2?.id,
      name: 'MERCEDES GLC 300 2024',
      slug: 'mercedes-glc-300-2024',
      modelYear: 2024,
      licensePlate: '51A-222.01',
      color: 'Xám',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 9500000,
      pricePerMonth: 200000000,
      depositAmount: 50000000,
      description: 'SUV hạng sang đa dụng, phù hợp cả gia đình và công việc.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1606611013016-969c19ba27a5?w=600&h=400&fit=crop',
      rating: 4.9,
      reviewCount: 41,
      isFeatured: true,
      featuredTag: 'XE_SANG',
    },
    {
      brandId: bmw.id,
      modelId: bmw320iModel.id,
      categoryId: sedanCat.id,
      stationId: station1?.id,
      name: 'BMW 320i 2024',
      slug: 'bmw-320i-2024',
      modelYear: 2024,
      licensePlate: '51A-333.01',
      color: 'Trắng Alpine',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 7500000,
      pricePerMonth: 160000000,
      depositAmount: 35000000,
      description: 'Sedan thể thao BMW 320i Sport Line.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=600&h=400&fit=crop',
      rating: 4.6,
      reviewCount: 25,
      isFeatured: true,
      featuredTag: 'XE_DOI_MOI',
    },
    {
      brandId: bmw.id,
      modelId: bmwX5Model.id,
      categoryId: suvCat.id,
      stationId: station2?.id,
      name: 'BMW X5 2023',
      slug: 'bmw-x5-2023',
      modelYear: 2023,
      licensePlate: '51A-444.01',
      color: 'Đen Sapphire',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'DIESEL',
      pricePerDay: 12000000,
      pricePerMonth: 250000000,
      depositAmount: 60000000,
      description: 'SUV hạng sang BMW X5 xDrive40i.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=600&h=400&fit=crop',
      rating: 4.9,
      reviewCount: 18,
      isFeatured: true,
      featuredTag: 'XE_SANG',
    },
    {
      brandId: lexus.id,
      modelId: lexusModel.id,
      categoryId: sedanCat.id,
      stationId: station1?.id,
      name: 'LEXUS ES 250 2024',
      slug: 'lexus-es-250-2024',
      modelYear: 2024,
      licensePlate: '51A-555.01',
      color: 'Bạc',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 6500000,
      pricePerMonth: 140000000,
      depositAmount: 30000000,
      description: 'Sedan hạng sang Lexus ES 250 Luxury.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&h=400&fit=crop',
      rating: 4.7,
      reviewCount: 22,
      isFeatured: true,
      featuredTag: 'DAT_HANG',
    },
    {
      brandId: toyota.id,
      modelId: toyotaCamryModel.id,
      categoryId: sedanCat.id,
      stationId: station1?.id,
      name: 'TOYOTA CAMRY 2024',
      slug: 'toyota-camry-2024',
      modelYear: 2024,
      licensePlate: '51A-666.01',
      color: 'Đen',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 3500000,
      pricePerMonth: 75000000,
      depositAmount: 15000000,
      description: 'Sedan trung cấp bán chạy nhất Việt Nam.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=600&h=400&fit=crop',
      rating: 4.5,
      reviewCount: 56,
      isFeatured: true,
      featuredTag: 'DAT_HANG',
    },
    {
      brandId: toyota.id,
      modelId: fortunerModel.id,
      categoryId: suvCat.id,
      stationId: station2?.id,
      name: 'TOYOTA FORTUNER 2024',
      slug: 'toyota-fortuner-2024',
      modelYear: 2024,
      licensePlate: '51A-777.01',
      color: 'Trắng Ngọc Trai',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'DIESEL',
      pricePerDay: 4500000,
      pricePerMonth: 95000000,
      depositAmount: 20000000,
      description: 'SUV 7 chỗ phù hợp đi xa, đi gia đình.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=600&h=400&fit=crop',
      rating: 4.4,
      reviewCount: 48,
      isFeatured: true,
      featuredTag: 'DAT_HANG',
    },
    {
      brandId: hyundai.id,
      modelId: santaFeModel.id,
      categoryId: suvCat.id,
      stationId: station1?.id,
      name: 'HYUNDAI SANTA FE 2024',
      slug: 'hyundai-santa-fe-2024',
      modelYear: 2024,
      licensePlate: '51A-888.01',
      color: 'Xanh đậm',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'DIESEL',
      pricePerDay: 3800000,
      pricePerMonth: 80000000,
      depositAmount: 18000000,
      description: 'SUV 7 chỗ hiện đại, đầy đủ tiện nghi.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=600&h=400&fit=crop',
      rating: 4.3,
      reviewCount: 35,
      isFeatured: true,
      featuredTag: 'XE_DOI_MOI',
    },
    {
      brandId: porsche.id,
      modelId: cayenneModel.id,
      categoryId: sportCat.id,
      stationId: station1?.id,
      name: 'PORSCHE CAYENNE 2024',
      slug: 'porsche-cayenne-2024',
      modelYear: 2024,
      licensePlate: '51A-999.01',
      color: 'Đỏ Carmine',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 18000000,
      pricePerMonth: 380000000,
      depositAmount: 100000000,
      description: 'SUV thể thao đẳng cấp Porsche Cayenne S.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1614200187524-dc4b892acf16?w=600&h=400&fit=crop',
      rating: 5.0,
      reviewCount: 12,
      isFeatured: true,
      featuredTag: 'XE_SANG',
    },
    {
      brandId: ford.id,
      modelId: explorerModel.id,
      categoryId: suvCat.id,
      stationId: station2?.id,
      name: 'FORD EXPLORER 2024',
      slug: 'ford-explorer-2024',
      modelYear: 2024,
      licensePlate: '51A-100.01',
      color: 'Trắng',
      seats: 7,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 5500000,
      pricePerMonth: 115000000,
      depositAmount: 25000000,
      description: 'SUV hạng sang Mỹ, mạnh mẽ và rộng rãi.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&h=400&fit=crop',
      rating: 4.6,
      reviewCount: 30,
      isFeatured: true,
      featuredTag: 'XE_DOI_MOI',
    },
    {
      brandId: mercedes.id,
      modelId: mercedesC300Model.id,
      categoryId: sedanCat.id,
      stationId: station1?.id,
      name: 'MERCEDES C300 2023',
      slug: 'mercedes-c300-2023',
      modelYear: 2023,
      licensePlate: '51A-200.01',
      color: 'Xanh Cavansite',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      pricePerDay: 7800000,
      pricePerMonth: 165000000,
      depositAmount: 38000000,
      description: 'Mercedes C300 đời 2023, nội thất sang trọng.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=600&h=400&fit=crop',
      rating: 4.5,
      reviewCount: 40,
      isFeatured: true,
      featuredTag: 'DAT_HANG',
    },
  ];

  for (const v of demoVehicles) {
    await prisma.vehicle.upsert({ where: { slug: v.slug }, update: {}, create: v });
  }
  console.log('  ✓ Vehicles');

  // 8) Site settings
  const settings = [
    { key: 'site_hotline', value: '0986310849', grp: 'contact', label: 'Hotline' },
    { key: 'site_email', value: 'contact@vflash.com.vn', grp: 'contact', label: 'Email hỗ trợ' },
    {
      key: 'site_address',
      value: '55 Đặng Nhữ Mai, Phường Cát Lái, Thành Phố Hồ Chí Minh, Việt Nam',
      grp: 'contact',
      label: 'Địa chỉ',
    },
    {
      key: 'site_hours',
      value: 'Thứ 2 - Thứ 7 | 8:00 AM - 5:20 PM',
      grp: 'contact',
      label: 'Giờ làm việc',
    },
    { key: 'site_name', value: 'CarGoGo', grp: 'general', label: 'Tên website' },
    {
      key: 'site_facebook',
      value: 'https://facebook.com/CarGoGo.vn',
      grp: 'social',
      label: 'Facebook',
    },
    {
      key: 'site_instagram',
      value: 'https://instagram.com/CarGoGo.vn',
      grp: 'social',
      label: 'Instagram',
    },
    {
      key: 'site_linkedin',
      value: 'https://linkedin.com/company/CarGoGo',
      grp: 'social',
      label: 'LinkedIn',
    },
    { key: 'site_twitter', value: 'https://twitter.com/CarGoGo', grp: 'social', label: 'Twitter' },
    // Pricing config (Day 35 / UC-60) — read by pricing code instead of hardcoding.
    { key: 'tax_rate', value: '10', grp: 'pricing', label: 'Thuế suất (%)' },
    { key: 'deposit_default', value: '5000000', grp: 'pricing', label: 'Đặt cọc mặc định (VND)' },
    {
      key: 'dropoff_penalty',
      value: '200000',
      grp: 'pricing',
      label: 'Phụ phí trả khác điểm (VND)',
    },
    { key: 'hourly_rate_ratio', value: '0.18', grp: 'pricing', label: 'Hệ số giá theo giờ' },
    { key: 'with_driver_surcharge', value: '0.4', grp: 'pricing', label: 'Phụ phí tài xế' },
  ];
  for (const st of settings) {
    await prisma.siteSetting.upsert({
      where: { key: st.key },
      update: { value: st.value },
      create: st,
    });
  }
  console.log('  ✓ Site settings');

  // 8b) Rescue / roadside stations (Day 37 / UC-31)
  const rescueStations = [
    {
      name: 'Trạm cứu hộ CarGoGo Quận 1',
      city: 'Hồ Chí Minh',
      district: 'Quận 1',
      address: '12 Lê Duẩn, Bến Nghé, Quận 1, TP.HCM',
      latitude: 10.7803,
      longitude: 106.6994,
      phone: '0901000001',
      hours: '24/7',
    },
    {
      name: 'Trạm cứu hộ CarGoGo TP. Thủ Đức',
      city: 'Hồ Chí Minh',
      district: 'TP. Thủ Đức',
      address: '52 Võ Văn Ngân, Linh Chiểu, TP. Thủ Đức, TP.HCM',
      latitude: 10.8494,
      longitude: 106.7537,
      phone: '0901000002',
      hours: '24/7',
    },
    {
      name: 'Trạm cứu hộ CarGoGo Tân Bình',
      city: 'Hồ Chí Minh',
      district: 'Tân Bình',
      address: '203 Hoàng Văn Thụ, Phường 8, Tân Bình, TP.HCM',
      latitude: 10.7981,
      longitude: 106.6614,
      phone: '0901000003',
      hours: '06:00 - 22:00',
    },
    {
      name: 'Trạm cứu hộ CarGoGo Hà Nội - Cầu Giấy',
      city: 'Hà Nội',
      district: 'Cầu Giấy',
      address: '144 Xuân Thủy, Dịch Vọng Hậu, Cầu Giấy, Hà Nội',
      latitude: 21.0362,
      longitude: 105.7827,
      phone: '0901000004',
      hours: '24/7',
    },
    {
      name: 'Trạm cứu hộ CarGoGo Đà Nẵng',
      city: 'Đà Nẵng',
      district: 'Hải Châu',
      address: '35 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
      latitude: 16.0603,
      longitude: 108.2172,
      phone: '0901000005',
      hours: '24/7',
    },
  ];
  for (const s of rescueStations) {
    const existing = await prisma.rescueStation.findFirst({ where: { name: s.name } });
    if (!existing) await prisma.rescueStation.create({ data: s });
  }
  console.log('  ✓ Rescue stations');

  // 9) Demo blog: categories, tags, posts (UC-21/22/25/26/27)
  const admin = await prisma.user.findUnique({ where: { phone: ADMIN_PHONE } });

  const postCategories = [
    { name: 'Kinh nghiệm thuê xe', slug: 'kinh-nghiem-thue-xe' },
    { name: 'Đánh giá xe', slug: 'danh-gia-xe' },
    { name: 'Tin khuyến mãi', slug: 'tin-khuyen-mai' },
  ];
  for (const c of postCategories) {
    await prisma.postCategory.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  const blogTags = ['Xe sang', 'SUV', 'Sedan', 'Tự lái', 'Mẹo hay', 'So sánh'].map((name) => ({
    name,
    slug: slugify(name),
  }));
  for (const t of blogTags) {
    await prisma.tag.upsert({ where: { slug: t.slug }, update: {}, create: t });
  }

  const catExp = await prisma.postCategory.findUnique({ where: { slug: 'kinh-nghiem-thue-xe' } });
  const catRev = await prisma.postCategory.findUnique({ where: { slug: 'danh-gia-xe' } });
  const catPromo = await prisma.postCategory.findUnique({ where: { slug: 'tin-khuyen-mai' } });
  const tagBySlug = async (s) => prisma.tag.findUnique({ where: { slug: s } });

  const posts = [
    {
      title: 'Top 5 Xe Sang Cho Thuê Hot Nhất 2024',
      slug: 'top-5-xe-sang-cho-thue-2024',
      excerpt: 'Khám phá những mẫu xe sang được thuê nhiều nhất tại CarGoGo trong năm 2024.',
      content:
        'Năm 2024 chứng kiến nhu cầu thuê xe sang tăng mạnh. Dẫn đầu là Mercedes C300 với thiết kế AMG thể thao, tiếp đến là BMW X5, Lexus ES 250 và Porsche Cayenne. Bài viết phân tích chi tiết giá thuê, tiện nghi và lý do mỗi mẫu xe được khách hàng ưa chuộng.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&h=400&fit=crop',
      status: 'PUBLISHED',
      isFeatured: true,
      categoryId: catRev.id,
      publishedAt: new Date('2024-12-01'),
      tagSlugs: ['xe-sang', 'so-sanh'],
    },
    {
      title: 'Hướng dẫn thuê xe tự lái cho người mới',
      slug: 'huong-dan-thue-xe-tu-lai',
      excerpt: 'Mọi thứ bạn cần biết trước khi thuê xe tự lái lần đầu tiên.',
      content:
        'Thuê xe tự lái lần đầu có thể khiến nhiều người bối rối. Bài viết hướng dẫn từng bước: chuẩn bị giấy tờ (CCCD, bằng lái), kiểm tra xe trước khi nhận, các điều khoản đặt cọc, bảo hiểm và những lưu ý khi trả xe để tránh phát sinh chi phí.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1449965408869-ebd13bc9e5a8?w=600&h=400&fit=crop',
      status: 'PUBLISHED',
      isFeatured: true,
      categoryId: catExp.id,
      publishedAt: new Date('2024-11-15'),
      tagSlugs: ['tu-lai', 'meo-hay'],
    },
    {
      title: 'So sánh SUV 7 chỗ: Fortuner vs Santa Fe vs Explorer',
      slug: 'so-sanh-suv-7-cho',
      excerpt: 'Phân tích chi tiết ba mẫu SUV 7 chỗ phổ biến nhất tại Việt Nam.',
      content:
        'Toyota Fortuner, Hyundai Santa Fe và Ford Explorer là ba lựa chọn SUV 7 chỗ hàng đầu. Bài viết so sánh về không gian, động cơ, mức tiêu hao nhiên liệu, tiện nghi và giá thuê theo ngày để giúp bạn chọn được chiếc xe phù hợp cho chuyến đi gia đình.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=600&h=400&fit=crop',
      status: 'PUBLISHED',
      isFeatured: false,
      categoryId: catRev.id,
      publishedAt: new Date('2024-11-01'),
      tagSlugs: ['suv', 'so-sanh'],
    },
    {
      title: 'Ưu đãi mùa hè: Giảm đến 20% khi thuê xe dài ngày',
      slug: 'uu-dai-mua-he-giam-20',
      excerpt: 'Chương trình khuyến mãi mùa hè 2026 với nhiều mã giảm giá hấp dẫn.',
      content:
        'Chào hè 2026, CarGoGo tung ra loạt mã ưu đãi: SUMMER10 giảm 10%, VIP20 giảm tới 20% cho đơn từ 5 triệu. Bài viết hướng dẫn cách áp dụng mã, điều kiện sử dụng và mẹo kết hợp ưu đãi để tiết kiệm tối đa cho chuyến đi của bạn.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600&h=400&fit=crop',
      status: 'PUBLISHED',
      isFeatured: true,
      categoryId: catPromo.id,
      publishedAt: new Date('2026-06-01'),
      tagSlugs: ['meo-hay'],
    },
    {
      title: 'Đánh giá Mercedes C300 2024: Sedan sang trong tầm giá',
      slug: 'danh-gia-mercedes-c300-2024',
      excerpt: 'Trải nghiệm thực tế mẫu sedan hạng sang Mercedes C300 đời 2024.',
      content:
        'Mercedes C300 2024 nâng cấp ngôn ngữ thiết kế, màn hình MBUX lớn và động cơ mild-hybrid tiết kiệm. Sau hành trình 500km, chúng tôi đánh giá cao sự êm ái, cách âm tốt và cảm giác lái chắc chắn. Đây là lựa chọn lý tưởng cho khách thuê muốn trải nghiệm xe sang.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=600&h=400&fit=crop',
      status: 'PUBLISHED',
      isFeatured: false,
      categoryId: catRev.id,
      publishedAt: new Date('2026-05-20'),
      tagSlugs: ['xe-sang', 'sedan'],
    },
    {
      title: 'Bài viết nháp chưa xuất bản',
      slug: 'bai-viet-nhap',
      excerpt: 'Bài nháp dùng để kiểm thử bộ lọc PUBLISHED.',
      content: 'Nội dung nháp — không nên xuất hiện trong danh sách công khai.',
      status: 'DRAFT',
      isFeatured: false,
      categoryId: catExp.id,
      publishedAt: null,
      tagSlugs: [],
    },
  ];
  for (const p of posts) {
    const { tagSlugs, ...data } = p;
    const post = await prisma.post.upsert({
      where: { slug: p.slug },
      update: {
        isFeatured: data.isFeatured,
        categoryId: data.categoryId,
        authorId: admin?.id ?? null,
        status: data.status,
        publishedAt: data.publishedAt,
      },
      create: { ...data, authorId: admin?.id ?? null },
    });
    for (const ts of tagSlugs) {
      const tag = await tagBySlug(ts);
      if (tag) {
        await prisma.postTag.upsert({
          where: { postId_tagId: { postId: post.id, tagId: tag.id } },
          update: {},
          create: { postId: post.id, tagId: tag.id },
        });
      }
    }
  }
  console.log('  ✓ Posts + Categories + Tags');

  // 9b) Demo comments (Day 22 — UC-24). Idempotent: only seed if none exist
  // for the target post, so re-running doesn't pile up duplicates.
  const firstPost = await prisma.post.findUnique({
    where: { slug: 'top-5-xe-sang-cho-thue-2024' },
  });
  if (firstPost && customer) {
    const existingComments = await prisma.comment.count({ where: { postId: firstPost.id } });
    if (existingComments === 0) {
      await prisma.comment.createMany({
        data: [
          {
            postId: firstPost.id,
            userId: customer.id,
            content: 'Bài viết rất hữu ích, mình đã thuê thử Mercedes C300 và trải nghiệm tuyệt vời!',
            status: 'APPROVED',
          },
          {
            postId: firstPost.id,
            userId: customer.id,
            content: 'Cho mình hỏi giá thuê BMW X5 cuối tuần có chênh nhiều không ạ?',
            status: 'APPROVED',
          },
          {
            postId: firstPost.id,
            userId: customer.id,
            content: 'Bình luận này đang chờ duyệt để kiểm thử luồng moderation.',
            status: 'PENDING',
          },
        ],
      });
    }
  }
  console.log('  ✓ Comments');

  // ─── 10) Insurance Plans (Day 12 — UC-15) ──────────────────────────
  const insurancePlans = [
    {
      code: 'BASIC',
      name: 'Bảo hiểm cơ bản',
      description: 'Bảo hiểm trách nhiệm dân sự bắt buộc. Bồi thường tối đa 100 triệu VND.',
      ratePercent: 5,
      isActive: true,
    },
    {
      code: 'PREMIUM',
      name: 'Bảo hiểm cao cấp',
      description:
        'Bảo hiểm toàn diện: thân xe + hành khách + tai nạn lái xe. Bồi thường tối đa 500 triệu VND.',
      ratePercent: 10,
      isActive: true,
    },
  ];
  for (const ip of insurancePlans) {
    await prisma.insurancePlan.upsert({
      where: { code: ip.code },
      update: { name: ip.name, description: ip.description, ratePercent: ip.ratePercent },
      create: ip,
    });
  }
  console.log('  ✓ Insurance Plans');

  // ─── 11) Coupons (Day 12 — UC-16) ─────────────────────────────────
  const coupons = [
    {
      code: 'WELCOME50K',
      type: 'FIXED',
      value: 50000,
      minOrder: 500000,
      maxDiscount: null,
      maxUse: 1000,
      maxUsePerUser: 1,
      startAt: new Date('2024-01-01'),
      endAt: new Date('2027-12-31'),
      isActive: true,
    },
    {
      code: 'SUMMER10',
      type: 'PERCENT',
      value: 10,
      minOrder: 1000000,
      maxDiscount: 500000,
      maxUse: 500,
      maxUsePerUser: 2,
      startAt: new Date('2026-06-01'),
      endAt: new Date('2026-08-31'),
      isActive: true,
    },
    {
      code: 'FREEDRIVER',
      type: 'FREE_DRIVER',
      value: 0,
      minOrder: 3000000,
      maxDiscount: null,
      maxUse: 100,
      maxUsePerUser: 1,
      startAt: new Date('2026-01-01'),
      endAt: new Date('2027-06-30'),
      isActive: true,
    },
    {
      code: 'VIP20',
      type: 'PERCENT',
      value: 20,
      minOrder: 5000000,
      maxDiscount: 2000000,
      maxUse: 50,
      maxUsePerUser: 1,
      startAt: new Date('2026-01-01'),
      endAt: new Date('2026-12-31'),
      isActive: true,
    },
    {
      code: 'EXPIRED2025',
      type: 'FIXED',
      value: 100000,
      minOrder: 0,
      maxDiscount: null,
      maxUse: 0,
      maxUsePerUser: 1,
      startAt: new Date('2025-01-01'),
      endAt: new Date('2025-06-30'),
      isActive: true,
    },
  ];
  for (const cp of coupons) {
    await prisma.coupon.upsert({
      where: { code: cp.code },
      update: {},
      create: cp,
    });
  }
  console.log('  ✓ Coupons');

  // B2B — 1 test company + 2 employees + default AssetHub price table
  const DEFAULT_PRICE_CONFIG = JSON.stringify({
    '4_5_seat': {
      half_day_0_100km: 600000,
      half_day_100_150km: 800000,
      full_day_100_150km: 1000000,
      full_day_150_200km: 1200000,
    },
    '7_seat': {
      half_day_0_100km: 700000,
      half_day_100_150km: 1000000,
      full_day_100_150km: 1100000,
      full_day_150_200km: 1300000,
    },
    '16_seat': {
      half_day_0_100km: 800000,
      half_day_100_150km: 1200000,
      full_day_100_150km: 1300000,
      full_day_150_200km: 1500000,
    },
  });

  const corporate = await prisma.corporateClient.upsert({
    where: { taxCode: '0312345678' },
    update: {
      priceConfig: DEFAULT_PRICE_CONFIG,
      isActive: true,
      contractRef: 'HĐ-2026/CCDV',
    },
    create: {
      name: 'AssetHub',
      taxCode: '0312345678',
      address: 'Quận 1, TP.HCM',
      contactName: 'Nguyễn Văn A',
      contactPhone: '0909000111',
      contactEmail: 'ops@assethub.vn',
      contractRef: 'HĐ-2026/CCDV',
      contractStart: new Date('2026-01-01'),
      contractEnd: new Date('2026-12-31'),
      creditLimit: 50000000,
      paymentTermDays: 30,
      priceConfig: DEFAULT_PRICE_CONFIG,
      isActive: true,
    },
  });

  const corpAdminHash = await bcrypt.hash('CorpAdmin@123', saltRounds);
  const corpAdminUser = await prisma.user.upsert({
    where: { phone: '0909000222' },
    update: {},
    create: {
      roleId: customerRole.id,
      fullName: 'Corporate Admin AssetHub',
      phone: '0909000222',
      email: 'corp-admin@assethub.vn',
      passwordHash: corpAdminHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  const corpEmpHash = await bcrypt.hash('CorpEmp@123', saltRounds);
  const corpEmpUser = await prisma.user.upsert({
    where: { phone: '0909000333' },
    update: {},
    create: {
      roleId: customerRole.id,
      fullName: 'Nhân viên AssetHub',
      phone: '0909000333',
      email: 'employee@assethub.vn',
      passwordHash: corpEmpHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  await prisma.corporateEmployee.upsert({
    where: { userId: corpAdminUser.id },
    update: {
      corporateId: corporate.id,
      isAdmin: true,
      isActive: true,
      department: 'Operations',
      employeeCode: 'AH-ADMIN-01',
    },
    create: {
      corporateId: corporate.id,
      userId: corpAdminUser.id,
      isAdmin: true,
      isActive: true,
      department: 'Operations',
      employeeCode: 'AH-ADMIN-01',
      invitedPhone: corpAdminUser.phone,
      invitedEmail: corpAdminUser.email,
      inviteUsedAt: new Date(),
    },
  });

  await prisma.corporateEmployee.upsert({
    where: { userId: corpEmpUser.id },
    update: {
      corporateId: corporate.id,
      isAdmin: false,
      isActive: true,
      department: 'Sales',
      employeeCode: 'AH-EMP-01',
    },
    create: {
      corporateId: corporate.id,
      userId: corpEmpUser.id,
      isAdmin: false,
      isActive: true,
      department: 'Sales',
      employeeCode: 'AH-EMP-01',
      invitedPhone: corpEmpUser.phone,
      invitedEmail: corpEmpUser.email,
      inviteUsedAt: new Date(),
    },
  });
  console.log('  ✓ B2B Corporate (AssetHub + 2 employees + default price config)');

  // Marketplace Phase A — demo supplier + SUPPLIER_ADMIN + SUPPLIER_DRIVER
  const supplier = await prisma.supplier.upsert({
    where: { taxCode: '0318127382' },
    update: {
      name: 'Nhà xe AssetHub Fleet',
      isActive: true,
      commissionRate: 0.15,
      contractRef: 'HĐ-SP-2026/001',
      transportLicenseNo: 'VT-HCM-2026-001',
    },
    create: {
      name: 'Nhà xe AssetHub Fleet',
      taxCode: '0318127382',
      address: 'B52-53, Đường D6, Khu dân cư Tân An Huy, Xã Nhà Bè, TP.HCM',
      contactName: 'Trần Anh Huy',
      contactPhone: '0912623203',
      contactEmail: 'fleet@assethub.vn',
      commissionRate: 0.15,
      note: 'Demo supplier — vùng HCM/HN, mạnh xe 4-16 chỗ',
      contractRef: 'HĐ-SP-2026/001',
      contractStart: new Date('2026-01-01'),
      contractEnd: new Date('2026-12-31'),
      transportLicenseNo: 'VT-HCM-2026-001',
      isActive: true,
    },
  });

  const supplierAdminHash = await bcrypt.hash('SupplierAdmin@123', saltRounds);
  const supplierAdminUser = await prisma.user.upsert({
    where: { phone: '0909000444' },
    update: {
      roleId: supplierAdminRole.id,
      status: 'ACTIVE',
    },
    create: {
      roleId: supplierAdminRole.id,
      fullName: 'Supplier Admin Fleet',
      phone: '0909000444',
      email: 'supplier-admin@assethub.vn',
      passwordHash: supplierAdminHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  const supplierDriverHash = await bcrypt.hash('SupplierDriver@123', saltRounds);
  const supplierDriverUser = await prisma.user.upsert({
    where: { phone: '0909000555' },
    update: {
      roleId: supplierDriverRole.id,
      status: 'ACTIVE',
    },
    create: {
      roleId: supplierDriverRole.id,
      fullName: 'Supplier Driver One',
      phone: '0909000555',
      email: 'supplier-driver@assethub.vn',
      passwordHash: supplierDriverHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  await prisma.supplierMember.upsert({
    where: { userId: supplierAdminUser.id },
    update: {
      supplierId: supplier.id,
      isAdmin: true,
      isActive: true,
      fullName: supplierAdminUser.fullName,
    },
    create: {
      supplierId: supplier.id,
      userId: supplierAdminUser.id,
      fullName: supplierAdminUser.fullName,
      isAdmin: true,
      isActive: true,
      invitedPhone: supplierAdminUser.phone,
      invitedEmail: supplierAdminUser.email,
      inviteUsedAt: new Date(),
    },
  });

  await prisma.supplierMember.upsert({
    where: { userId: supplierDriverUser.id },
    update: {
      supplierId: supplier.id,
      isAdmin: false,
      isActive: true,
      fullName: supplierDriverUser.fullName,
    },
    create: {
      supplierId: supplier.id,
      userId: supplierDriverUser.id,
      fullName: supplierDriverUser.fullName,
      isAdmin: false,
      isActive: true,
      invitedPhone: supplierDriverUser.phone,
      invitedEmail: supplierDriverUser.email,
      inviteUsedAt: new Date(),
    },
  });
  console.log('  ✓ Marketplace Supplier (AssetHub Fleet + admin + driver)');

  // ENT-Day 1 — VAS catalog + AssetHub SLA defaults (Điều 3 HĐ)
  const defaultVAS = [
    {
      code: 'INTERPRETER',
      name: 'Phiên dịch viên',
      description: 'Phiên dịch theo chuyến (ngôn ngữ theo note)',
      unit: 'người/chuyến',
      basePrice: 500000,
      requiresHeadcount: true,
    },
    {
      code: 'SECURITY',
      name: 'Bảo vệ',
      description: 'Nhân sự bảo vệ đi kèm chuyến',
      unit: 'người/chuyến',
      basePrice: 800000,
      requiresHeadcount: true,
    },
    {
      code: 'MEDIA_TEAM',
      name: 'Đội truyền thông',
      description: 'Ekip truyền thông / PR theo chuyến',
      unit: 'buổi',
      basePrice: 2500000,
      requiresHeadcount: false,
    },
    {
      code: 'ASSISTANT',
      name: 'Trợ lý',
      description: 'Trợ lý hành chính / protocol theo chuyến',
      unit: 'người/chuyến',
      basePrice: 600000,
      requiresHeadcount: true,
    },
    {
      code: 'PHOTOGRAPHER',
      name: 'Nhiếp ảnh/Video',
      description: 'Quay chụp sự kiện theo chuyến',
      unit: 'buổi',
      basePrice: 1500000,
      requiresHeadcount: false,
    },
  ];
  for (const v of defaultVAS) {
    await prisma.valueAddedService.upsert({
      where: { code: v.code },
      update: {
        name: v.name,
        description: v.description,
        unit: v.unit,
        basePrice: v.basePrice,
        requiresHeadcount: v.requiresHeadcount,
        isActive: true,
      },
      create: { ...v, isActive: true },
    });
  }
  console.log('  ✓ ENT VAS catalog (5 services)');

  const defaultSLAs = [
    {
      code: 'PUNCTUALITY',
      name: 'Đúng giờ',
      description: 'Cam kết đón/trả đúng giờ theo Điều 3 HĐ',
      targetValue: '≤ 5 phút trễ',
      penaltyRule: 'Vi phạm 2 lần → Bên A được từ chối chuyến',
    },
    {
      code: 'VEHICLE_CONDITION',
      name: 'Chất lượng xe',
      description: 'Xe sạch sẽ, điều hòa và trang thiết bị hoạt động tốt',
      targetValue: 'Sạch sẽ, điều hòa hoạt động',
      penaltyRule: 'Vi phạm MAJOR → giảm giá hoặc đổi xe',
    },
    {
      code: 'DRIVER_CONDUCT',
      name: 'Thái độ tài xế',
      description: 'Tài xế lịch sự, đúng đồng phục, tuân thủ quy trình',
      targetValue: 'Không khiếu nại từ khách',
      penaltyRule: 'Vi phạm 2 lần CRITICAL → đủ điều kiện chấm dứt HĐ',
    },
    {
      code: 'INFO_SECURITY',
      name: 'Bảo mật thông tin',
      description: 'Không tiết lộ lịch trình / thông tin khách hàng',
      targetValue: 'Không rò rỉ thông tin',
      penaltyRule: 'Vi phạm CRITICAL → chấm dứt HĐ ngay',
    },
  ];
  for (const s of defaultSLAs) {
    await prisma.contractSLA.upsert({
      where: {
        corporateId_code: { corporateId: corporate.id, code: s.code },
      },
      update: {
        name: s.name,
        description: s.description,
        targetValue: s.targetValue,
        penaltyRule: s.penaltyRule,
        isActive: true,
      },
      create: {
        corporateId: corporate.id,
        ...s,
        isActive: true,
      },
    });
  }
  console.log('  ✓ ENT Contract SLA (4 defaults for AssetHub)');

  console.log('\n✅ Seed done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
