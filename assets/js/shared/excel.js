/** پارس اکسل فروش استیکر */

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

function mapColumns(keys) {
  const colMap = {};
  keys.forEach((k) => {
    const kl = String(k).toLowerCase();
    if (k.includes('استیکر') || kl.includes('product') || (kl.includes('name') && !colMap.name)) colMap.name = k;
    else if (kl.includes('variant id') || k === 'id' || k.includes('variant id')) colMap.id = k;
    else if (k.includes('variant 1') || k.includes('جنس')) colMap.v1 = k;
    else if (k.includes('variant 2') || k.includes('ابعاد')) colMap.v2 = k;
    else if (k.includes('تعداد فروش') || kl.includes('qty') || kl.includes('quantity') || (kl.includes('sales') && !colMap.qty)) colMap.qty = k;
    else if (k.includes('قیمت') || kl === 'price') colMap.price = k;
    else if (k.includes('مجموع') && !k.includes('تعداد') && !k.includes('مبلغ') && !colMap.total) colMap.total = k;
  });
  if (!colMap.name) colMap.name = keys.find((k) => k.includes('استیکر')) || 'استیکر';
  if (!colMap.v1) colMap.v1 = keys.find((k) => k.toLowerCase().includes('variant 1')) || 'variant 1 attributes';
  if (!colMap.v2) colMap.v2 = keys.find((k) => k.toLowerCase().includes('variant 2')) || 'variant 2 attributes';
  if (!colMap.qty) colMap.qty = keys.find((k) => k.includes('تعداد فروش')) || 'تعداد فروش فصل';
  if (!colMap.price) colMap.price = keys.find((k) => k.includes('قیمت')) || 'قیمت';
  if (!colMap.total) colMap.total = keys.find((k) => k === 'مجموع') || 'مجموع';
  if (!colMap.id) colMap.id = keys.find((k) => k.toLowerCase().includes('variant id')) || 'variant id';
  return colMap;
}

/** از workbook → { rawRows, products } */
export function parseWorkbookData(wb) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
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
      const qty = Number(r[colMap.qty]) || 0;
      const price = Number(r[colMap.price]) || 0;
      let total = Number(r[colMap.total]);
      if (!total && qty && price) total = qty * price;
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

/** نسخه ساده‌تر برای پنل ادمین (فقط name/qty/price/total) */
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
