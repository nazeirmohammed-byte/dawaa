import type { Prisma } from './generated/client';

type BoardRow = {
  lane: 'KPI' | 'INVENTORY' | 'PROCUREMENT' | 'MARKETING';
  severity: 'info' | 'watch' | 'urgent';
  code: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  figureAr: string;
  figureEn: string;
  sortOrder: number;
};

const SIGNALS: BoardRow[] = [
  {
    lane: 'KPI',
    severity: 'info',
    code: 'sales-today',
    titleAr: 'مبيعات اليوم',
    titleEn: 'Sales today',
    detailAr: 'ثلاث ورديات. النقد ما زال الأعلى.',
    detailEn: 'Three shifts. Cash is still the largest share.',
    figureAr: '186,500 ج.س',
    figureEn: '186,500 SDG',
    sortOrder: 1,
  },
  {
    lane: 'KPI',
    severity: 'watch',
    code: 'expiry-30',
    titleAr: 'قرب الانتهاء خلال 30 يوماً',
    titleEn: 'Expiring within 30 days',
    detailAr: 'أصناف تحتاج قرار: إرجاع أو نقل أو تخفيض.',
    detailEn: 'Items that need a return, a transfer, or a discount.',
    figureAr: '14 صنفاً',
    figureEn: '14 items',
    sortOrder: 2,
  },
  {
    lane: 'KPI',
    severity: 'urgent',
    code: 'below-reorder',
    titleAr: 'تحت حد الطلب',
    titleEn: 'Below reorder level',
    detailAr: 'أصناف ستنفد إذا لم يُفتح طلب شراء اليوم.',
    detailEn: 'Items that will stock out without a purchase today.',
    figureAr: '7 أصناف',
    figureEn: '7 items',
    sortOrder: 3,
  },
  {
    lane: 'KPI',
    severity: 'info',
    code: 'gross-margin',
    titleAr: 'هامش اليوم',
    titleEn: 'Margin today',
    detailAr: 'بعد تكلفة آخر استلام. راجع الأصناف المرتبطة بالدولار.',
    detailEn: 'After the latest receipt cost. Review USD-linked items.',
    figureAr: '18.5%',
    figureEn: '18.5%',
    sortOrder: 4,
  },
  {
    lane: 'INVENTORY',
    severity: 'urgent',
    code: 'amox-expiry',
    titleAr: 'أموكسيسيلين 500',
    titleEn: 'Amoxicillin 500',
    detailAr: 'التشغيلة AMX-204 تنتهي خلال 28 يوماً. الكمية ما زالت مرتفعة.',
    detailEn: 'Batch AMX-204 expires in 28 days and the quantity is still high.',
    figureAr: '14 علبة',
    figureEn: '14 boxes',
    sortOrder: 1,
  },
  {
    lane: 'INVENTORY',
    severity: 'urgent',
    code: 'insulin-low',
    titleAr: 'أنسولين مبرد',
    titleEn: 'Refrigerated insulin',
    detailAr: 'أقل من حد الطلب. تأكد من الثلاجة قبل إعادة الطلب.',
    detailEn: 'Under the reorder level. Check the fridge before reordering.',
    figureAr: '3 علب',
    figureEn: '3 boxes',
    sortOrder: 2,
  },
  {
    lane: 'INVENTORY',
    severity: 'watch',
    code: 'vitamin-slow',
    titleAr: 'فيتامين سي فوار',
    titleEn: 'Effervescent vitamin C',
    detailAr: 'بطيء الحركة منذ 45 يوماً. مرشح لعرض أو نقل.',
    detailEn: 'Slow for 45 days. A candidate for a promotion or a transfer.',
    figureAr: '40 علبة',
    figureEn: '40 boxes',
    sortOrder: 3,
  },
  {
    lane: 'INVENTORY',
    severity: 'info',
    code: 'stock-value',
    titleAr: 'قيمة المخزون بالتكلفة',
    titleEn: 'Stock at cost',
    detailAr: 'الفرع الرئيسي فقط. التجزئة أعلى من هذا الرقم.',
    detailEn: 'Main branch only. Retail value is higher than this.',
    figureAr: '4,820,000 ج.س',
    figureEn: '4,820,000 SDG',
    sortOrder: 4,
  },
  {
    lane: 'PROCUREMENT',
    severity: 'urgent',
    code: 'po-amox',
    titleAr: 'طلبية مقترحة: أموكسيسيلين',
    titleEn: 'Suggested order: amoxicillin',
    detailAr: 'المورد المعتاد شركة النيل. صلاحية الاستلام لا تقل عن 6 أشهر.',
    detailEn: 'Usual supplier is Nile Co. Remaining shelf life must be at least 6 months.',
    figureAr: '24 علبة',
    figureEn: '24 boxes',
    sortOrder: 1,
  },
  {
    lane: 'PROCUREMENT',
    severity: 'watch',
    code: 'supplier-due',
    titleAr: 'فاتورة شركة الشفاء',
    titleEn: 'Al-Shifa invoice',
    detailAr: 'غير مسددة. الاستحقاق بعد 5 أيام. جهّز تحويل بنكك.',
    detailEn: 'Unpaid. Due in 5 days. Prepare the Bankak transfer.',
    figureAr: '640,000 ج.س',
    figureEn: '640,000 SDG',
    sortOrder: 2,
  },
  {
    lane: 'PROCUREMENT',
    severity: 'info',
    code: 'incoming',
    titleAr: 'استلام غداً',
    titleEn: 'Arriving tomorrow',
    detailAr: 'فيتامين د. جهّز ملصقات الباركود للقطع بلا باركود الشركة.',
    detailEn: 'Vitamin D. Prepare barcode labels for items without a manufacturer code.',
    figureAr: '12 علبة',
    figureEn: '12 boxes',
    sortOrder: 3,
  },
  {
    lane: 'MARKETING',
    severity: 'info',
    code: 'top-seller',
    titleAr: 'الأكثر مبيعاً هذا الأسبوع',
    titleEn: 'Top seller this week',
    detailAr: 'بنادول أدفانس. لا تخفّضه. راقب نفاد الشريط.',
    detailEn: 'Panadol Advance. Do not discount it. Watch the strip stock.',
    figureAr: '96 شريطاً',
    figureEn: '96 strips',
    sortOrder: 1,
  },
  {
    lane: 'MARKETING',
    severity: 'watch',
    code: 'refill',
    titleAr: 'إعادة صرف الضغط',
    titleEn: 'Blood-pressure refills',
    detailAr: 'مرضى لهم موعد صرف خلال 7 أيام. رسالة قصيرة تذكّرهم.',
    detailEn: 'Patients due a refill within 7 days. A short message reminds them.',
    figureAr: '18 مريضاً',
    figureEn: '18 patients',
    sortOrder: 2,
  },
  {
    lane: 'MARKETING',
    severity: 'urgent',
    code: 'margin-fx',
    titleAr: 'هامش بعد سعر الصرف',
    titleEn: 'Margin after the exchange rate',
    detailAr: 'شريط الأموكسيسيلين أصبح قريباً من التكلفة. يحتاج إعادة تسعير.',
    detailEn: 'The amoxicillin strip is close to cost and needs a reprice.',
    figureAr: '4%',
    figureEn: '4%',
    sortOrder: 3,
  },
];

const RECEIPT_LINES = [
  {
    nameAr: 'أموكسيسيلين 500',
    nameEn: 'Amoxicillin 500',
    qty: '2',
    unitAr: 'شريط',
    unitEn: 'strip',
    price: '3500.00',
    total: '7000.00',
  },
  {
    nameAr: 'فيتامين سي فوار',
    nameEn: 'Vitamin C effervescent',
    qty: '1',
    unitAr: 'علبة',
    unitEn: 'box',
    price: '4500.00',
    total: '4500.00',
  },
  {
    nameAr: 'باراسيتامول أطفال',
    nameEn: 'Paediatric paracetamol',
    qty: '1',
    unitAr: 'شريط',
    unitEn: 'strip',
    price: '1250.00',
    total: '1250.00',
  },
];

export async function seedOperationsBoard(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
): Promise<void> {
  const existing = await tx.operationalSignal.count({ where: { tenantId } });
  if (existing === 0) {
    await tx.operationalSignal.createMany({
      data: SIGNALS.map((row) => ({
        tenantId,
        branchId,
        ...row,
      })),
    });
  }

  const receipt = await tx.receiptDraft.findFirst({ where: { tenantId } });
  if (!receipt) {
    await tx.receiptDraft.create({
      data: {
        tenantId,
        branchId,
        receiptNo: 'N-10482',
        cashierName: 'أمين النيل',
        soldAt: new Date('2026-10-10T15:30:00.000Z'),
        linesJson: JSON.stringify(RECEIPT_LINES),
        subtotal: '12750.00',
        discount: '250.00',
        total: '12500.00',
        paid: '15000.00',
        changeDue: '2500.00',
        paymentMethod: 'CASH',
      },
    });
  }
}
