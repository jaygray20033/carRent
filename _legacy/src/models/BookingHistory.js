const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BookingHistory = sequelize.define('BookingHistory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'bookings', key: 'id' },
    },
    from_status: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'null for initial creation',
    },
    to_status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    changed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'User ID who triggered the change, null for system',
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('metadata');
        return raw ? JSON.parse(raw) : null;
      },
      set(val) {
        this.setDataValue('metadata', val ? JSON.stringify(val) : null);
      },
    },
  }, {
    tableName: 'booking_histories',
    timestamps: true,
    underscored: true,
    updatedAt: false,
  });

  return BookingHistory;
};
