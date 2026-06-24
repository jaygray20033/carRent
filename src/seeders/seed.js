/**
 * Seed script: creates test data for development
 * Run with: node src/seeders/seed.js
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { sequelize, User, Car, Coupon } = require('../models');

async function seed() {
  console.log('[Seed] Starting...');

  await sequelize.sync({ force: true });
  console.log('[Seed] Database reset');

  // Users
  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await User.create({
    email: 'admin@otorent.vn',
    password_hash: passwordHash,
    full_name: 'Admin OtoRent',
    phone: '0901000001',
    role: 'ADMIN',
  });

  const renter = await User.create({
    email: 'renter@gmail.com',
    password_hash: passwordHash,
    full_name: 'Nguyen Van A',
    phone: '0901000002',
    role: 'USER',
  });

  const carOwner = await User.create({
    email: 'owner@gmail.com',
    password_hash: passwordHash,
    full_name: 'Tran Van B',
    phone: '0901000003',
    role: 'CAR_OWNER',
  });

  console.log('[Seed] Users created');

  // Cars
  const car1 = await Car.create({
    owner_id: carOwner.id,
    brand: 'Toyota',
    model: 'Camry 2.5Q',
    year: 2023,
    license_plate: '30A-12345',
    price_per_day: 1200000, // 1.2M VND
    location: 'Quận 1, TP.HCM',
    seats: 5,
    transmission: 'AUTOMATIC',
    fuel_type: 'GASOLINE',
    is_available: true,
    images: ['https://example.com/camry1.jpg'],
  });

  const car2 = await Car.create({
    owner_id: carOwner.id,
    brand: 'Honda',
    model: 'City RS',
    year: 2024,
    license_plate: '51A-67890',
    price_per_day: 800000, // 800K VND
    location: 'Quận 7, TP.HCM',
    seats: 5,
    transmission: 'AUTOMATIC',
    fuel_type: 'GASOLINE',
    is_available: true,
    images: ['https://example.com/city1.jpg'],
  });

  console.log('[Seed] Cars created');

  // Coupons
  await Coupon.create({
    code: 'WELCOME10',
    type: 'PERCENTAGE',
    value: 10,
    max_discount: 200000, // Max 200K VND
    min_order_value: 500000,
    usage_limit: 100,
    used_count: 0,
    per_user_limit: 1,
    starts_at: new Date('2024-01-01'),
    expires_at: new Date('2027-12-31'),
    is_active: true,
  });

  await Coupon.create({
    code: 'FLAT100K',
    type: 'FIXED',
    value: 100000, // 100K VND off
    min_order_value: 1000000,
    usage_limit: 50,
    used_count: 0,
    per_user_limit: 2,
    starts_at: new Date('2024-01-01'),
    expires_at: new Date('2027-12-31'),
    is_active: true,
  });

  console.log('[Seed] Coupons created');

  console.log('\n[Seed] ✅ Done! Test accounts:');
  console.log('  Admin:    admin@otorent.vn / password123');
  console.log('  Renter:   renter@gmail.com / password123');
  console.log('  Owner:    owner@gmail.com / password123');
  console.log('  Cars:     Toyota Camry (1.2M/day), Honda City (800K/day)');
  console.log('  Coupons:  WELCOME10 (10% off, max 200K), FLAT100K (100K off)');

  await sequelize.close();
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
