const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CouponUsage = sequelize.define('CouponUsage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    coupon_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'coupons', key: 'id' },
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'bookings', key: 'id' },
    },
    discount_amount: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: false,
    },
  }, {
    tableName: 'coupon_usages',
    timestamps: true,
    underscored: true,
    updatedAt: false,
  });

  return CouponUsage;
};
