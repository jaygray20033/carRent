// prisma/seed.prod.js — production seed guard.
//
// Runs the SAME dataset as seed.js (demo vehicles + magazine posts + AssetHub
// corporate + supplier + the NKV customer, all kept on purpose for prod testing),
// but refuses to run unless a STRONG admin password is supplied via env — so the
// public "Admin@123" default from seed.js can never reach production.
//
//   SEED_ADMIN_PASSWORD=<strong>  node prisma/seed.prod.js
//
// Optional overrides (else fall back to the demo admin identity):
//   SEED_ADMIN_PHONE, SEED_ADMIN_EMAIL
//
// seed.js reads these same env vars and auto-runs main() on import, so this file
// only has to validate the password and then hand off.
import 'dotenv/config';

const pw = process.env.SEED_ADMIN_PASSWORD;

// Mirror the app's own password policy so the seeded admin can actually log in
// and isn't trivially guessable: ≥8 chars with upper, lower and a digit.
const strong = typeof pw === 'string' && pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);

if (!strong) {
  console.error(
    '✗ Refusing to seed production without a strong SEED_ADMIN_PASSWORD.\n' +
      '  Set it to ≥8 chars including upper + lower + a digit, e.g.:\n' +
      '    SEED_ADMIN_PASSWORD=Str0ngPass!  node prisma/seed.prod.js'
  );
  process.exit(1);
}

if (pw === 'Admin@123') {
  console.error('✗ SEED_ADMIN_PASSWORD is still the public demo password. Choose a private one.');
  process.exit(1);
}

console.log('🔐 Production seed — admin password taken from SEED_ADMIN_PASSWORD.');

// Hand off to the shared seed (auto-runs main() and disconnects on finish).
await import('./seed.js');
