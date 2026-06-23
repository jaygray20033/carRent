// ─────────────────────────────────────────────────────────────────────
//  src/server.js — Application entry point
// ─────────────────────────────────────────────────────────────────────
import app from './app.js';
import env from './config/env.js';

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`🚗 OtoRent API running on port ${PORT} [${env.NODE_ENV}]`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}${env.API_PREFIX}`);
});
