const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Car = sequelize.define('Car', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    owner_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    brand: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    model: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    license_plate: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    price_per_day: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: false,
      comment: 'VND per day',
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    seats: {
      type: DataTypes.INTEGER,
      defaultValue: 4,
    },
    transmission: {
      type: DataTypes.ENUM('AUTOMATIC', 'MANUAL'),
      defaultValue: 'AUTOMATIC',
    },
    fuel_type: {
      type: DataTypes.ENUM('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID'),
      defaultValue: 'GASOLINE',
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    images: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('images');
        return raw ? JSON.parse(raw) : [];
      },
      set(val) {
        this.setDataValue('images', JSON.stringify(val || []));
      },
    },
  }, {
    tableName: 'cars',
    timestamps: true,
    underscored: true,
  });

  return Car;
};
