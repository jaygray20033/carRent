// scripts/cleanup-junk-brands.js
//
// One-off cleanup for junk test brands that leaked into the dev DB.
// Source: payments.test.js / vnpayIpn.test.js / coverageBoost.test.js seeded
// PayBrand{stamp} / VnpBrand{stamp} / BoostBrand{stamp} in beforeAll and swallowed
// delete errors in afterAll (FK: leftover vehicles/bookings blocked the delete),
// so the brands piled up permanently.
//
// Usage:
//   node scripts/cleanup-junk-brands.js              # DRY-RUN (default) — lists only
//   node scripts/cleanup-junk-brands.js --execute    # actually delete
//
// Deletes FK-safe, per brand: booking children (sos/payments/history) → bookings →
// vehicle images → vehicles → vehicle models → brand. Errors are logged, never swallowed.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const JUNK_NAME = /^(BoostBrand|PayBrand|VnpBrand)\d+$/;
const DRY_RUN = !process.argv.includes('--execute');

async function deleteBrandCascade(brand) {
  const vehicles = await prisma.vehicle.findMany({
    where: { brandId: brand.id },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);

  const models = await prisma.vehicleModel.findMany({
    where: { brandId: brand.id },
    select: { id: true },
  });
  const modelIds = models.map((m) => m.id);

  let bookingIds = [];
  if (vehicleIds.length) {
    const bookings = await prisma.booking.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: { id: true },
    });
    bookingIds = bookings.map((b) => b.id);
  }

  console.log(
    `  → brand #${brand.id} "${brand.name}": ${vehicleIds.length} vehicle(s), ` +
      `${modelIds.length} model(s), ${bookingIds.length} booking(s)`
  );

  if (DRY_RUN) return { vehicles: vehicleIds.length, models: modelIds.length, bookings: bookingIds.length };

  // Everything for one brand in a single transaction so a mid-way FK error
  // rolls back cleanly instead of leaving half-deleted rows.
  await prisma.$transaction(async (tx) => {
    if (bookingIds.length) {
      // Booking children that use RESTRICT (won't auto-cascade on booking delete).
      await tx.sosRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.bookingHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.review.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (vehicleIds.length) {
      // Reviews / corporate bookings can reference the vehicle directly.
      await tx.review.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
      await tx.corporateBooking.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
      await tx.vehicleImage.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
      await tx.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    }
    if (modelIds.length) {
      await tx.vehicleModel.deleteMany({ where: { id: { in: modelIds } } });
    }
    await tx.brand.delete({ where: { id: brand.id } });
  });

  return { vehicles: vehicleIds.length, models: modelIds.length, bookings: bookingIds.length };
}

async function main() {
  console.log(DRY_RUN ? '🔎 DRY-RUN (no deletes). Pass --execute to delete.\n' : '🗑️  EXECUTE mode — deleting.\n');

  // MySQL regex isn't exposed via Prisma; fetch the candidate prefixes, filter in JS
  // against the exact /^(BoostBrand|PayBrand|VnpBrand)\d+$/ pattern.
  const candidates = await prisma.brand.findMany({
    where: {
      OR: [
        { name: { startsWith: 'BoostBrand' } },
        { name: { startsWith: 'PayBrand' } },
        { name: { startsWith: 'VnpBrand' } },
      ],
    },
    select: { id: true, name: true, slug: true },
    orderBy: { id: 'asc' },
  });

  const junk = candidates.filter((b) => JUNK_NAME.test(b.name));
  console.log(`Found ${junk.length} junk brand(s) matching /^(BoostBrand|PayBrand|VnpBrand)\\d+$/:\n`);
  for (const b of junk) console.log(`  #${b.id}  ${b.name}  (slug=${b.slug})`);
  console.log('');

  if (!junk.length) {
    console.log('Nothing to do.');
    return;
  }

  let ok = 0;
  const failed = [];
  for (const brand of junk) {
    try {
      await deleteBrandCascade(brand);
      if (!DRY_RUN) {
        console.log(`  ✓ deleted brand #${brand.id} "${brand.name}"`);
        ok += 1;
      }
    } catch (err) {
      // Do NOT swallow — this is exactly the failure mode that let junk accumulate.
      console.error(`  ✗ FAILED brand #${brand.id} "${brand.name}":`, err.message);
      failed.push({ id: brand.id, name: brand.name, error: err.message });
    }
  }

  console.log('');
  if (DRY_RUN) {
    console.log(`DRY-RUN complete. ${junk.length} brand(s) would be processed. Re-run with --execute to delete.`);
  } else {
    console.log(`Done. Deleted ${ok}/${junk.length}. Failed: ${failed.length}.`);
    if (failed.length) {
      console.log('Failures:');
      for (const f of failed) console.log(`  #${f.id} ${f.name}: ${f.error}`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
