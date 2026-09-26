/**
 * پارس PDF فروش — با PDF.js
 * انتظار: جدول متنی شبیه اکسل (ردیف، استیکر، تعداد فروش، قیمت، مجموع، ...)
 */

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** خطوط متن صفحه را به ردیف‌های فروش تبدیل می‌کند */
function parseLinesToRows(lines) {
  const rows = [];
  // الگوهای رایج: عدد ردیف + نام محصول + اعداد
  const skuRe = /^(IN|SKU|sk)\w*/i;
  const headerHints = /ردیف|استیکر|تعداد|قیمت|مجموع|variant|sku/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || headerHints.test(line)) {
      i++;
      continue;
    }

    // ردیف عددی شروع جدول
    const rowNum = line.match(/^(\d{1,4})$/);
    if (rowNum) {
      // بعد از شماره ردیف: ممکن است sku و سپس نام بیاید
      let name = '';
      let qty = 0;
      let price = 0;
      let total = 0;
      let j = i + 1;
      const collected = [];
      while (j < lines.length && collected.length < 12) {
        const t = lines[j].trim();
        if (/^\d{1,4}$/.test(t) && collected.length >= 1) break;
        if (t) collected.push(t);
        j++;
      }

      // فیلتر sku
      const nonSku = collected.filter((c) => !skuRe.test(c) && !/^ابعاد=/.test(c) && !/variant/i.test(c));
      // نام معمولاً اولین رشتهٔ غیرعددی بلند است
      for (const c of nonSku) {
        if (!/^\d+([.,]\d+)?$/.test(c) && c.length > 2 && !name) {
          name = c;
          continue;
        }
        const n = num(c);
        if (n > 0) {
          // heuristics: qty کوچک‌تر، price حدود هزاران، total بزرگ‌تر
          if (!qty && n < 100000) qty = n;
          else if (!price && n >= 1000 && n < 10_000_000) price = n;
          else if (!total) total = n;
          else if (n > total) total = n;
        }
      }

      if (name) {
        if (!total && qty && price) total = qty * price;
        rows.push({ name, qty, price, total: total || 0 });
      }
      i = j;
      continue;
    }

    // خط ترکیبی: «نام محصول 12 9900 118800»
    const m = line.match(/^(.+?)\s+(\d+)\s+(\d[\d,]*)\s+(\d[\d,]*)$/);
    if (m && m[1].length > 2 && !headerHints.test(m[1])) {
      const q = num(m[2]);
      const p = num(m[3]);
      let t = num(m[4]);
      if (!t && q && p) t = q * p;
      rows.push({ name: m[1].trim(), qty: q, price: p, total: t });
    }
    i++;
  }
  return rows;
}

/**
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {object} pdfjsLib — از window.pdfjsLib
 */
export async function parsePdfBytes(buffer, pdfjsLib) {
  if (!pdfjsLib) throw new Error('PDF.js بارگذاری نشده است');
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const allLines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // گروه‌بندی بر اساس y تقریبی
    const items = content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        str: it.str.trim(),
        x: it.transform[4],
        y: Math.round(it.transform[5]),
      }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let lastY = null;
    let line = [];
    for (const it of items) {
      if (lastY != null && Math.abs(it.y - lastY) > 3) {
        if (line.length) allLines.push(line.map((x) => x.str).join(' '));
        line = [];
      }
      line.push(it);
      lastY = it.y;
    }
    if (line.length) allLines.push(line.map((x) => x.str).join(' '));
  }

  let rows = parseLinesToRows(allLines);

  // fallback: جستجوی الگوهای «استیکر ...» در کل متن
  if (rows.length < 3) {
    const text = allLines.join('\n');
    const re = /استیکر[^\n\d]{2,80}.*?(\d+)\s+(\d[\d,]*)\s+(\d[\d,]*)/g;
    let m;
    const found = [];
    while ((m = re.exec(text)) !== null) {
      const name = m[0].replace(/\s+\d[\d,.\s]*$/, '').trim();
      const qty = num(m[1]);
      const price = num(m[2]);
      let total = num(m[3]);
      if (!total && qty && price) total = qty * price;
      if (name.length > 3) found.push({ name, qty, price, total });
    }
    if (found.length > rows.length) rows = found;
  }

  if (!rows.length) {
    throw new Error(
      'از PDF هیچ ردیف فروشی استخراج نشد. اگر اکسل دارید همان را آپلود کنید، یا ساختار PDF را بررسی کنید.'
    );
  }
  return rows;
}
