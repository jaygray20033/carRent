const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Coupon = sequelize.define('Coupon', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.ENUM('PERCENTAGE', 'FIXED'),
      allowNull: false,
    },
    value: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: false,
      comment: 'PERCENTAGE: 0-100, FIXED: VND amount',
    },
    max_discount: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: true,
      comment: 'Max discount cap for PERCENTAGE type (VND)',
    },
    min_order_value: {
      type: DataTypes.DECIMAL(12, 0),
      defaultValue: 0,
      comment: 'Minimum booking value to use coupon (VND)',
    },
    usage_limit: {
      type: DataTypes.INTEGER,
      defaultValue: null,
      comment: 'Total usage limit, null = unlimited',
    },
    used_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    per_user_limit: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    starts_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: 'coupons',
    timestamps: true,
    underscored: true,
  });

  return Coupon;
};
