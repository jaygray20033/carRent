// scripts/update-brand-logos.js
//
// Point the 10 real brands at local /uploads/brands/* logos.
// seed.js now does this too (upsert update block), but the dev DB already has
// these brands, so this one-off fixes existing rows without a full re-seed.
//
// Usage:
//   node scripts/update-brand-logos.js              # DRY-RUN (default)
//   node scripts/update-brand-logos.js --execute    # write changes
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--execute');

// Static /uploads assets are served by the API, so logos need an absolute URL
// (same convention as storage.js). A relative "/uploads/.." would resolve
// against the FE origin (:3000) and 404.
const APP_URL = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');

// slug → local logo path (Toyota is SVG, the rest PNG — see uploads/brands/).
const LOGOS = {
  bmw: `${APP_URL}/uploads/brands/bmw.png`,
  mercedes: `${APP_URL}/uploads/brands/mercedes.png`,
  lexus: `${APP_URL}/uploads/brands/lexus.png`,
  toyota: `${APP_URL}/uploads/brands/toyota.svg`,
  hyundai: `${APP_URL}/uploads/brands/hyundai.png`,
  peugeot: `${APP_URL}/uploads/brands/peugeot.png`,
  kia: `${APP_URL}/uploads/brands/kia.png`,
  porsche: `${APP_URL}/uploads/brands/porsche.png`,
  audi: `${APP_URL}/uploads/brands/audi.png`,
  ford: `${APP_URL}/uploads/brands/ford.png`,
};

async function main() {
  console.log(DRY_RUN ? '🔎 DRY-RUN (no writes). Pass --execute to update.\n' : '✏️  EXECUTE mode — updating.\n');

  let updated = 0;
  const missing = [];
  for (const [slug, logoUrl] of Object.entries(LOGOS)) {
    const brand = await prisma.brand.findUnique({ where: { slug }, select: { id: true, name: true, logoUrl: true } });
    if (!brand) {
      missing.push(slug);
      console.log(`  – ${slug}: not in DB (skipped)`);
      continue;
    }
    if (brand.logoUrl === logoUrl) {
      console.log(`  = ${slug}: already ${logoUrl}`);
      continue;
    }
    console.log(`  → ${slug} (#${brand.id}): ${brand.logoUrl ?? '(null)'}  ⇒  ${logoUrl}`);
    if (!DRY_RUN) {
      await prisma.brand.update({ where: { id: brand.id }, data: { logoUrl } });
      updated += 1;
    }
  }

  console.log('');
  if (DRY_RUN) {
    console.log('DRY-RUN complete. Re-run with --execute to write.');
  } else {
    console.log(`Done. Updated ${updated} brand(s).`);
  }
  if (missing.length) console.log(`Not found in DB: ${missing.join(', ')}`);
}

main()
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
