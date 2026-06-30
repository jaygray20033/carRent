// prisma/seed.js — OtoRent seed data (MySQL)
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

  // 1) Roles
  const roles = [
    { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
    { code: 'ADMIN', name: 'Quản trị viên', description: 'Toàn quyền hệ thống' },
    { code: 'OPERATOR', name: 'Nhân viên vận hành', description: 'Quản lý xe & đơn thuê' },
    { code: 'AGENT', name: 'Đại lý', description: 'Đối tác cung cấp xe' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { code: r.code }, update: {}, create: r });
  }
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
  console.log('  ✓ Roles');

  // 2) Users
  const saltRounds = 12;
  const adminHash = await bcrypt.hash('Admin@123', saltRounds);
  await prisma.user.upsert({
    where: { phone: '0900000001' },
    update: {},
    create: {
      roleId: adminRole.id,
      fullName: 'System Admin',
      phone: '0900000001',
      email: 'admin@otorent.vn',
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
      logoUrl: 'https://www.carlogos.org/car-logos/bmw-logo-2020-grey.png',
      country: 'Germany',
    },
    {
      name: 'Mercedes',
      slug: 'mercedes',
      logoUrl: 'https://www.carlogos.org/car-logos/mercedes-benz-logo-2011.png',
      country: 'Germany',
    },
    {
      name: 'Lexus',
      slug: 'lexus',
      logoUrl: 'https://www.carlogos.org/car-logos/lexus-logo-2013.png',
      country: 'Japan',
    },
    {
      name: 'Toyota',
      slug: 'toyota',
      logoUrl: 'https://www.carlogos.org/car-logos/toyota-logo-2020-europe.png',
      country: 'Japan',
    },
    {
      name: 'Hyundai',
      slug: 'hyundai',
      logoUrl: 'https://www.carlogos.org/car-logos/hyundai-logo-2011.png',
      country: 'South Korea',
    },
    {
      name: 'Peugeot',
      slug: 'peugeot',
      logoUrl: 'https://www.carlogos.org/car-logos/peugeot-logo-2010.png',
      country: 'France',
    },
    {
      name: 'Kia',
      slug: 'kia',
      logoUrl: 'https://www.carlogos.org/car-logos/kia-logo-2021.png',
      country: 'South Korea',
    },
    {
      name: 'Porsche',
      slug: 'porsche',
      logoUrl: 'https://www.carlogos.org/car-logos/porsche-logo-2014.png',
      country: 'Germany',
    },
    {
      name: 'Audi',
      slug: 'audi',
      logoUrl: 'https://www.carlogos.org/car-logos/audi-logo-2016.png',
      country: 'Germany',
    },
    {
      name: 'Ford',
      slug: 'ford',
      logoUrl: 'https://www.carlogos.org/car-logos/ford-logo-2017.png',
      country: 'USA',
    },
  ];
  for (const b of brands) {
    await prisma.brand.upsert({ where: { slug: b.slug }, update: {}, create: b });
  }
  console.log('  ✓ Brands');

  // 5) Stations
  const stations = [
    {
      name: 'OtoRent HQ - Quận 2',
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
  const coupeCat = await prisma.category.findUnique({ where: { slug: 'coupe' } });

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
    { key: 'site_name', value: 'OtoRent', grp: 'general', label: 'Tên website' },
    {
      key: 'site_facebook',
      value: 'https://facebook.com/otorent.vn',
      grp: 'social',
      label: 'Facebook',
    },
    {
      key: 'site_instagram',
      value: 'https://instagram.com/otorent.vn',
      grp: 'social',
      label: 'Instagram',
    },
    {
      key: 'site_linkedin',
      value: 'https://linkedin.com/company/otorent',
      grp: 'social',
      label: 'LinkedIn',
    },
    { key: 'site_twitter', value: 'https://twitter.com/otorent', grp: 'social', label: 'Twitter' },
  ];
  for (const st of settings) {
    await prisma.siteSetting.upsert({
      where: { key: st.key },
      update: { value: st.value },
      create: st,
    });
  }
  console.log('  ✓ Site settings');

  // 9) Demo blog: categories, tags, posts (UC-21/22/25/26/27)
  const admin = await prisma.user.findUnique({ where: { phone: '0900000001' } });

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
      excerpt: 'Khám phá những mẫu xe sang được thuê nhiều nhất tại OtoRent trong năm 2024.',
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
        'Chào hè 2026, OtoRent tung ra loạt mã ưu đãi: SUMMER10 giảm 10%, VIP20 giảm tới 20% cho đơn từ 5 triệu. Bài viết hướng dẫn cách áp dụng mã, điều kiện sử dụng và mẹo kết hợp ưu đãi để tiết kiệm tối đa cho chuyến đi của bạn.',
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
