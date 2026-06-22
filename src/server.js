// src/server.js
import app from './app.js';
import env from './config/env.js';

const PORT = env.port;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚗 OtoRent API running at http://0.0.0.0:${PORT}`);
  console.log(`📖 Swagger docs: http://localhost:${PORT}/api-docs`);
  console.log(`🔧 Environment: ${env.nodeEnv}`);
});
