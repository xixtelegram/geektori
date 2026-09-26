/** پارس اکسل فروش استیکر */

/** تبدیل ارقام فارسی/عربی و جداکننده هزارگان به عدد واقعی */
export function parseNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s || s === 'NaN' || s === 'null' || s === '-' || s === '—') return 0;
  // ارقام فارسی و عربی → لاتین
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of s) {
    const iFa = fa.indexOf(ch);
    if (iFa >= 0) {
      out += String(iFa);
      continue;
    }
    const iAr = ar.indexOf(ch);
    if (iAr >= 0) {
      out += String(iAr);
      continue;
    }
    out += ch;
  }
  // حذف واحدها و فاصله
  out = out
    .replace(/تومان|ریال|٪|%/gi, '')
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/٫/g, '.') // جداکننده اعشار فارسی
    .replace(/[^\d.-]/g, '');
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

function parseAttr(str, keyHint) {
  if (!str || str === 'NaN' || str === 'null') return null;
  const s = String(str).trim();
  if (s.includes('=')) {
    const parts = s.split(',').map((p) => p.trim());
    for (const p of parts) {
      if (p.includes(keyHint) || keyHint === '') {
        return p.split('=').pop().trim();
      }
    }
    return s.split('=').pop().trim();
  }
  return s;
}

export function extractMaterial(v1) {
  if (!v1) return '—';
  const s = String(v1);
  if (s.includes('جنس محصول')) return parseAttr(s, 'جنس') || '—';
  if (s.includes('نوع برش')) return 'برش';
  if (s.includes('زبان')) return 'کیبورد';
  if (s.includes('ابعاد')) return 'سایز خاص';
  return parseAttr(s, '') || s;
}

export function extractSize(v1, v2) {
  if (v1 && String(v1).includes('نوع برش')) return parseAttr(v1, 'برش') || '—';
  if (v1 && String(v1).includes('زبان')) return parseAttr(v1, 'زبان') || parseAttr(v1, '') || '—';
  if (v2 && String(v2).includes('ابعاد')) return parseAttr(v2, 'ابعاد') || '—';
  if (v1 && String(v1).includes('ابعاد')) return parseAttr(v1, 'ابعاد') || '—';
  if (v2) return String(v2).trim();
  return '—';
}

function cleanName(name) {
  return String(name || '').trim();
}

/**
 * تشخیص ستون‌ها — اولویت با مبلغ واقعی فروش (نه «مجموع تعداد»)
 * ستون‌های رایج فروشگاه‌ها: استیکر / تعداد فروش / قیمت / مجموع / مبلغ کل
 */
function mapColumns(keys) {
  const colMap = {};
  const scored = { total: [], price: [], qty: [], name: [] };

  keys.forEach((k) => {
    const kl = String(k).toLowerCase().trim();
    const raw = String(k).trim();

    // نام محصول
    if (
      raw.includes('استیکر') ||
      kl.includes('product') ||
      (kl.includes('name') && !kl.includes('file'))
    ) {
      scored.name.push({ k, score: raw.includes('استیکر') ? 10 : 5 });
    }

    // شناسه
    if (kl.includes('variant id') || kl === 'id' || kl.includes('sku')) {
      if (!colMap.id) colMap.id = k;
    }

    // واریانت
    if (kl.includes('variant 1') || raw.includes('جنس')) colMap.v1 = k;
    if (kl.includes('variant 2') || raw.includes('ابعاد')) colMap.v2 = k;

    // تعداد فروش
    if (
      raw.includes('تعداد فروش') ||
      kl.includes('quantity') ||
      kl === 'qty' ||
      (kl.includes('sales') && !kl.includes('amount') && !kl.includes('revenue'))
    ) {
      scored.qty.push({
        k,
        score: raw.includes('تعداد فروش') ? 10 : kl.includes('quantity') ? 8 : 4,
      });
    }

    // قیمت واحد — نه «قیمت کل»
    if (
      (raw.includes('قیمت') || kl === 'price' || kl.includes('unit price')) &&
      !raw.includes('کل') &&
      !kl.includes('total') &&
      !raw.includes('مجموع')
    ) {
      scored.price.push({
        k,
        score: kl === 'price' || raw === 'قیمت' ? 10 : 6,
      });
    }

    // مبلغ/مجموع فروش (درآمد واقعی)
    // اولویت: مبلغ کل / مجموع مبلغ / مجموع فروش / مجموع
    if (
      raw.includes('مبلغ') ||
      (raw.includes('مجموع') && !raw.includes('تعداد')) ||
      kl.includes('revenue') ||
      kl.includes('amount') ||
      (kl.includes('total') && !kl.includes('qty') && !kl.includes('quantity'))
    ) {
      let score = 3;
      if (raw.includes('مبلغ کل') || raw.includes('مجموع مبلغ')) score = 12;
      else if (raw.includes('مبلغ')) score = 10;
      else if (raw.includes('مجموع فروش') || raw.includes('مجموع درآمد')) score = 9;
      else if (raw === 'مجموع') score = 7;
      else if (kl.includes('total')) score = 5;
      scored.total.push({ k, score });
    }
  });

  const best = (arr) => (arr.length ? arr.sort((a, b) => b.score - a.score)[0].k : null);

  colMap.name = best(scored.name) || keys.find((k) => String(k).includes('استیکر')) || keys[0];
  colMap.qty =
    best(scored.qty) ||
    keys.find((k) => String(k).includes('تعداد فروش')) ||
    'تعداد فروش فصل';
  colMap.price = best(scored.price) || keys.find((k) => String(k).includes('قیمت')) || 'قیمت';
  colMap.total =
    best(scored.total) ||
    keys.find((k) => String(k).includes('مبلغ')) ||
    keys.find((k) => String(k) === 'مجموع') ||
    'مجموع';

  if (!colMap.v1) colMap.v1 = keys.find((k) => k.toLowerCase().includes('variant 1')) || 'variant 1 attributes';
  if (!colMap.v2) colMap.v2 = keys.find((k) => k.toLowerCase().includes('variant 2')) || 'variant 2 attributes';
  if (!colMap.id) colMap.id = keys.find((k) => k.toLowerCase().includes('variant id')) || 'variant id';

  return colMap;
}

/** از workbook → { rawRows, products } */
export function parseWorkbookData(wb) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (!data.length) throw new Error('فایل خالی است یا هیچ ردیفی ندارد.');

  const keys = Object.keys(data[0]);
  const colMap = mapColumns(keys);
  if (data[0][colMap.name] === undefined) {
    throw new Error(
      'ستون‌های مورد نیاز پیدا نشد.\nحداقل ستون «استیکر» لازم است.\nستون‌های موجود: ' + keys.join('، ')
    );
  }

  const rawRows = data
    .map((r, i) => {
      const name = cleanName(r[colMap.name]);
      if (!name) return null;

      const qty = parseNumber(r[colMap.qty]);
      let price = parseNumber(r[colMap.price]);
      let total = parseNumber(r[colMap.total]);

      // اگر مجموع خالی بود از qty * price بساز
      if (!total && qty && price) total = qty * price;

      // اگر قیمت واحد نبود ولی مجموع و تعداد بود → قیمت مؤثر
      if (!price && qty > 0 && total > 0) {
        price = Math.round((total / qty) * 100) / 100;
      }

      // اگر مجموع با qty*price خیلی فرق داشت ولی هر دو مثبت‌اند، مجموع فایل معتبر است (تخفیف)
      // قیمت واحد را برای نمایش حفظ می‌کنیم

      return {
        idx: i,
        id: r[colMap.id] || i,
        name,
        material: extractMaterial(r[colMap.v1]),
        size: extractSize(r[colMap.v1], r[colMap.v2]),
        qty,
        price,
        total: total || 0,
        rawV1: r[colMap.v1],
        rawV2: r[colMap.v2],
      };
    })
    .filter(Boolean);

  if (!rawRows.length) throw new Error('هیچ محصول معتبری در فایل پیدا نشد.');

  const map = new Map();
  rawRows.forEach((row) => {
    if (!map.has(row.name)) {
      map.set(row.name, {
        name: row.name,
        variants: [],
        totalQty: 0,
        totalRev: 0,
        maxPrice: 0,
        minPrice: Infinity,
        materials: new Set(),
        sizes: new Set(),
      });
    }
    const p = map.get(row.name);
    p.variants.push(row);
    p.totalQty += row.qty;
    p.totalRev += row.total;
    if (row.price > 0) {
      p.maxPrice = Math.max(p.maxPrice, row.price);
      p.minPrice = Math.min(p.minPrice, row.price);
    }
    if (row.material && row.material !== '—') p.materials.add(row.material);
    if (row.size && row.size !== '—') p.sizes.add(row.size);
  });

  const products = Array.from(map.values()).map((p) => {
    if (p.minPrice === Infinity) p.minPrice = 0;
    p.materials = Array.from(p.materials);
    p.sizes = Array.from(p.sizes);
    return p;
  });

  return { rawRows, products };
}

/** نسخه ساده‌تر برای پنل طراح/ادمین (فقط name/qty/price/total) */
export function parseExcelBytesSimple(bytes) {
  const wb = XLSX.read(bytes, { type: 'array' });
  const { rawRows } = parseWorkbookData(wb);
  return rawRows.map((r) => ({
    name: r.name,
    qty: r.qty,
    price: r.price,
    total: r.total,
  }));
}
