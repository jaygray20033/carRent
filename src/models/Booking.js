const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Booking = sequelize.define('Booking', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    booking_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Human-readable booking code e.g. BK-20240101-XXXX',
    },
    renter_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    car_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'cars', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM(
        'DRAFT', 'PENDING_PAYMENT', 'PAID', 'CONFIRMED',
        'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'
      ),
      defaultValue: 'DRAFT',
    },

    // Time range
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    pickup_time: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'e.g. 08:00',
    },
    return_time: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'e.g. 18:00',
    },
    pickup_location: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Pricing snapshot (saved at confirm time - anti-tampering)
    num_days: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    price_per_day: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: true,
      comment: 'Snapshot from car at confirm time',
    },
    base_price: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: true,
      comment: 'num_days * price_per_day',
    },

    // Insurance
    insurance_type: {
      type: DataTypes.ENUM('NONE', 'BASIC', 'PREMIUM'),
      defaultValue: 'NONE',
    },
    insurance_price_per_day: {
      type: DataTypes.DECIMAL(12, 0),
      defaultValue: 0,
    },
    insurance_total: {
      type: DataTypes.DECIMAL(12, 0),
      defaultValue: 0,
    },

    // Coupon
    coupon_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'coupons', key: 'id' },
    },
    coupon_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    discount_amount: {
      type: DataTypes.DECIMAL(12, 0),
      defaultValue: 0,
    },

    // Totals
    subtotal: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: true,
      comment: 'base_price + insurance_total',
    },
    total_price: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: true,
      comment: 'subtotal - discount_amount',
    },

    // Hold tracking
    hold_until: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the hold/reservation expires',
    },

    // Notes
    renter_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancel_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    confirmed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'bookings',
    timestamps: true,
    underscored: true,
  });

  return Booking;
};
