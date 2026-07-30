// scripts/create-test-settlement.js
//
// Dev helper: tạo một CorporateSettlement ở trạng thái CONFIRMED (đã chốt bảng kê,
// đang chờ thanh toán) cho công ty AssetHub — để test luồng thanh toán thủ công P2P
// (xem QR → "Tôi đã thanh toán" → gửi ảnh) trên portal doanh nghiệp.
//
// Đăng nhập admin doanh nghiệp: phone 0909000222 / mật khẩu CorpAdmin@123
// Trang: /enterprise/settlements → mở bảng kê vừa tạo.
//
// Usage:
//   node scripts/create-test-settlement.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const corporate = await prisma.corporateClient.findUnique({
    where: { taxCode: '0312345678' }, // AssetHub (seed)
  });
  if (!corporate) {
    throw new Error(
      'Không tìm thấy công ty AssetHub (taxCode 0312345678). Chạy `npm run seed` trước.'
    );
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Số tiền demo — QR VietQR sẽ dựng động theo totalAmount.
  const totalBaseAmount = 10_000_000;
  const totalExpenses = 1_500_000;
  const totalVat = Math.round((totalBaseAmount + totalExpenses) * 0.1);
  const totalAmount = totalBaseAmount + totalExpenses + totalVat;

  const settlement = await prisma.corporateSettlement.create({
    data: {
      corporateId: corporate.id,
      periodStart,
      periodEnd,
      totalBaseAmount,
      totalExpenses,
      totalVat,
      totalAmount,
      status: 'CONFIRMED', // đã xác nhận bảng kê → có thể bấm "Tôi đã thanh toán"
      confirmedAt: now,
      note: 'Bảng kê test luồng thanh toán thủ công (P2P) — tạo bằng scripts/create-test-settlement.js',
    },
  });

  console.log('✓ Đã tạo bảng kê CONFIRMED (chờ thanh toán):');
  console.log(`  - Settlement ID : ${settlement.id}`);
  console.log(`  - Công ty       : ${corporate.name} (id ${corporate.id})`);
  console.log(`  - Kỳ            : ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`);
  console.log(`  - Tổng phải trả : ${totalAmount.toLocaleString('vi-VN')} đ`);
  console.log('');
  console.log('Đăng nhập admin doanh nghiệp: phone 0909000222 / mật khẩu CorpAdmin@123');
  console.log(`Mở: http://localhost:3000/enterprise/settlements/${settlement.id}`);
}

main()
  .catch((e) => {
    console.error('✗ Lỗi:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
