const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

let sequelize;
if (config.dialect === 'sqlite') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.storage,
    logging: config.logging,
    define: config.define,
  });
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    define: config.define,
    pool: config.pool,
  });
}

// Import models
const User = require('./User')(sequelize);
const Car = require('./Car')(sequelize);
const Coupon = require('./Coupon')(sequelize);
const Booking = require('./Booking')(sequelize);
const BookingHistory = require('./BookingHistory')(sequelize);
const CouponUsage = require('./CouponUsage')(sequelize);

// Associations
// User <-> Booking
User.hasMany(Booking, { foreignKey: 'renter_id', as: 'bookings' });
Booking.belongsTo(User, { foreignKey: 'renter_id', as: 'renter' });

// Car <-> Booking
Car.hasMany(Booking, { foreignKey: 'car_id', as: 'bookings' });
Booking.belongsTo(Car, { foreignKey: 'car_id', as: 'car' });

// Car <-> User (owner)
User.hasMany(Car, { foreignKey: 'owner_id', as: 'cars' });
Car.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });

// Booking <-> BookingHistory
Booking.hasMany(BookingHistory, { foreignKey: 'booking_id', as: 'history' });
BookingHistory.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// Booking <-> CouponUsage
Booking.hasOne(CouponUsage, { foreignKey: 'booking_id', as: 'couponUsage' });
CouponUsage.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// Coupon <-> CouponUsage
Coupon.hasMany(CouponUsage, { foreignKey: 'coupon_id', as: 'usages' });
CouponUsage.belongsTo(Coupon, { foreignKey: 'coupon_id', as: 'coupon' });

// User <-> CouponUsage
User.hasMany(CouponUsage, { foreignKey: 'user_id', as: 'couponUsages' });
CouponUsage.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

const db = {
  sequelize,
  Sequelize,
  User,
  Car,
  Coupon,
  Booking,
  BookingHistory,
  CouponUsage,
};

module.exports = db;
