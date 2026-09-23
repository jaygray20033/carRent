const { Router } = require('express');
const authRoutes = require('./auth');
const bookingRoutes = require('./bookings');
const meRoutes = require('./me');

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route modules
router.use('/auth', authRoutes);
router.use('/bookings', bookingRoutes);
router.use('/me', meRoutes);

module.exports = router;
