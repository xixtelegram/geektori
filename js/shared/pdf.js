/**
 * پارس PDF فروش — با PDF.js
 * انتظار: جدول متنی شبیه اکسل (ردیف، استیکر، تعداد فروش، قیمت، مجموع، ...)
 *
 * محدودیت‌های منطقی برای جلوگیری از اعداد غول‌پیکر ناشی از چسبیدن ستون‌ها:
 * - تعداد فروش هر ردیف معمولاً زیر ۵۰٬۰۰۰
 * - قیمت واحد استیکر معمولاً ۱٬۰۰۰ تا ۵۰۰٬۰۰۰ تومان
 * - مبلغ ردیف معمولاً زیر ۲۰۰ میلیون تومان
 */

const MAX_QTY = 50_000;
const MIN_PRICE = 500;
const MAX_PRICE = 500_000;
const MAX_ROW_TOTAL = 200_000_000;

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
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
  const n = Number(out.replace(/,/g, '').replace(/٫/g, '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** آیا رشته فقط عدد (با کاما/اعشار) است؟ */
function isPureNumberToken(s) {
  return /^[\d۰-۹٠-٩.,٬٫]+$/.test(String(s).trim());
}

/**
 * از لیست توکن‌های یک ردیف، qty / price / total را با محدودیت منطقی استخراج می‌کند.
 * ترتیب ترجیحی در جدول فروش: ... نام | تعداد | قیمت | مجموع
 */
function classifyNumbers(tokens) {
  const nums = tokens
    .filter(isPureNumberToken)
    .map((t) => num(t))
    .filter((n) => n > 0);

  // حذف شماره‌های خیلی بزرگ (معمولاً حاصل چسبیدن چند ستون در PDF)
  const sane = nums.filter((n) => n <= MAX_ROW_TOTAL * 5);

  let qty = 0;
  let price = 0;
  let total = 0;

  // کاندیدها بر اساس بازه
  const qtyCands = sane.filter((n) => n <= MAX_QTY && Number.isInteger(n));
  const priceCands = sane.filter((n) => n >= MIN_PRICE && n <= MAX_PRICE);
  const totalCands = sane.filter((n) => n > MAX_PRICE && n <= MAX_ROW_TOTAL);

  // اگر سه عدد متوالی با الگوی qty, price, total جور بود
  for (let i = 0; i < sane.length - 2; i++) {
    const a = sane[i];
    const b = sane[i + 1];
    const c = sane[i + 2];
    if (a >= 1 && a <= MAX_QTY && b >= MIN_PRICE && b <= MAX_PRICE && c >= b && c <= MAX_ROW_TOTAL) {
      // ترجیح وقتی total نزدیک qty*price باشد (حتی با تخفیف تا ۷۰٪)
      const expected = a * b;
      if (c <= expected * 1.05 && c >= expected * 0.2) {
        return { qty: a, price: b, total: c };
      }
    }
  }

  // تخصیص جداگانه
  if (qtyCands.length) {
    // کوچک‌ترین عدد معقول که شبیه تعداد است (نه قیمت)
    const notPrice = qtyCands.filter((n) => n < MIN_PRICE || !priceCands.includes(n));
    qty = (notPrice.length ? notPrice : qtyCands)[0];
    // اگر چند کاندید بود، کوچک‌ترین را ترجیح بده مگر اینکه فقط یکی باشد
    if (notPrice.length > 1) qty = Math.min(...notPrice.filter((n) => n < 20_000));
  }

  if (priceCands.length) {
    // قیمت‌های تکراری رایج (مثل ۹۹۰۰) را ترجیح بده؛ وگرنه میانه
    const sorted = [...priceCands].sort((a, b) => a - b);
    price = sorted[Math.floor(sorted.length / 2)];
    // اگر ۹۹۰۰ یا مقادیر گرد رایج هست
    const common = priceCands.find((n) => n === 9900 || n === 8900 || n === 11900 || n === 14900);
    if (common) price = common;
  }

  if (totalCands.length) {
    total = Math.max(...totalCands);
  }

  // اگر total نبود از qty*price بساز
  if (!total && qty && price) total = qty * price;

  // اگر price نبود ولی total و qty بود
  if (!price && qty > 0 && total > 0) {
    const p = total / qty;
    if (p >= MIN_PRICE && p <= MAX_PRICE) price = Math.round(p * 100) / 100;
  }

  // اگر qty از حد خارج شد صفر کن
  if (qty > MAX_QTY) qty = 0;
  if (price > MAX_PRICE || price < 0) price = 0;
  if (total > MAX_ROW_TOTAL) {
    // احتمالاً چسبیده — اگر qty*price معقول است همان را بگذار
    if (qty && price) total = qty * price;
    else total = 0;
  }

  return { qty, price, total };
}

function pickName(tokens) {
  const skuRe = /^(IN|SKU|sk)\w*/i;
  for (const t of tokens) {
    const s = String(t).trim();
    if (!s || isPureNumberToken(s)) continue;
    if (skuRe.test(s)) continue;
    if (/^ابعاد=/.test(s) || /variant/i.test(s)) continue;
    if (s.length < 3) continue;
    // نام محصول معمولاً شامل حروف است
    if (/[\u0600-\u06FFa-zA-Z]/.test(s)) return s;
  }
  return '';
}

/** خطوط متن صفحه را به ردیف‌های فروش تبدیل می‌کند */
function parseLinesToRows(lines) {
  const rows = [];
  const headerHints = /ردیف|استیکر|تعداد|قیمت|مجموع|variant|sku|صفحه/i;
  const seen = new Set();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || headerHints.test(line)) {
      i++;
      continue;
    }

    // شروع ردیف با شماره ردیف ۱–۴ رقمی
    const rowNum = line.match(/^(\d{1,4})$/);
    if (rowNum) {
      const collected = [];
      let j = i + 1;
      while (j < lines.length && collected.length < 16) {
        const t = lines[j].trim();
        // ردیف بعدی جدول
        if (/^\d{1,4}$/.test(t) && collected.length >= 1) break;
        // هدر تکراری وسط صفحه
        if (headerHints.test(t) && collected.length >= 2) break;
        if (t) collected.push(t);
        j++;
      }

      const name = pickName(collected);
      const { qty, price, total } = classifyNumbers(collected);

      if (name && (qty > 0 || total > 0)) {
        const key = name + '|' + qty + '|' + total;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({
            name,
            qty: qty || 0,
            price: price || 0,
            total: total || (qty && price ? qty * price : 0),
          });
        }
      }
      i = j;
      continue;
    }

    // خط ترکیبی: «نام محصول 12 9900 118800»
    // فقط اگر سه عدد پایانی در بازه منطقی باشند
    const m = line.match(/^(.+?)\s+(\d{1,5})\s+(\d{3,7})\s+(\d{3,12})$/);
    if (m && m[1].length > 2 && !headerHints.test(m[1])) {
      const q = num(m[2]);
      const p = num(m[3]);
      let t = num(m[4]);
      if (q >= 1 && q <= MAX_QTY && p >= MIN_PRICE && p <= MAX_PRICE) {
        if (!t || t > MAX_ROW_TOTAL) t = q * p;
        if (t <= MAX_ROW_TOTAL) {
          const name = m[1].trim();
          const key = name + '|' + q + '|' + t;
          if (!seen.has(key)) {
            seen.add(key);
            rows.push({ name, qty: q, price: p, total: t });
          }
        }
      }
    }
    i++;
  }
  return rows;
}

/**
 * استخراج متن صفحه با حفظ ترتیب خواندن RTL/LTR
 * آیتم‌های نزدیک در یک خط ادغام می‌شوند؛ اعداد جداگانه توکن می‌مانند
 */
function pageItemsToLines(items) {
  if (!items.length) return [];
  // از بالا به پایین؛ در هر خط از راست به چپ (مناسب PDF فارسی)
  items.sort((a, b) => b.y - a.y || b.x - a.x);

  const lines = [];
  let lastY = null;
  let lineItems = [];

  const flush = () => {
    if (!lineItems.length) return;
    // داخل خط: از راست به چپ
    lineItems.sort((a, b) => b.x - a.x);
    // توکن‌ها را جدا نگه دار — با فاصله؛ از چسباندن رقم‌های ستون‌های مختلف جلوگیری می‌کند
    const parts = lineItems.map((it) => it.str);
    lines.push(parts.join(' '));
    // همچنین هر توکن را به‌صورت خط جدا برای حالتی که PDF هر سلول را جدا گذاشته
    // (parseLinesToRows با شماره ردیف کار می‌کند)
    lineItems = [];
  };

  for (const it of items) {
    if (lastY != null && Math.abs(it.y - lastY) > 4) flush();
    lineItems.push(it);
    lastY = it.y;
  }
  flush();
  return lines;
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
  /** هر سلول/توکن جدا — برای پارس مبتنی بر شماره ردیف */
  const allTokens = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it.str && String(it.str).trim())
      .map((it) => ({
        str: String(it.str).trim(),
        x: it.transform[4],
        y: Math.round(it.transform[5] * 10) / 10,
      }));

    const pageLines = pageItemsToLines(items);
    allLines.push(...pageLines);

    // توکن‌های مرتب‌شده برای fallback مبتنی بر جریان متن
    items.sort((a, b) => b.y - a.y || b.x - a.x);
    for (const it of items) allTokens.push(it.str);
  }

  let rows = parseLinesToRows(allLines);

  // اگر ردیف‌ها کم بود، جریان توکن‌ها را مثل خطوط جداگانه هم امتحان کن
  if (rows.length < 3) {
    rows = parseLinesToRows(allTokens);
  }

  // fallback: الگوی «استیکر ... qty price total» با محدودیت بازه
  if (rows.length < 3) {
    const text = allLines.join('\n');
    const re =
      /(استیکر[^\n]{2,60}?)\s+(\d{1,5})\s+(\d{3,7})\s+(\d{3,12})/g;
    let m;
    const found = [];
    const seen = new Set();
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim();
      const qty = num(m[2]);
      const price = num(m[3]);
      let total = num(m[4]);
      if (qty < 1 || qty > MAX_QTY) continue;
      if (price < MIN_PRICE || price > MAX_PRICE) continue;
      if (!total || total > MAX_ROW_TOTAL) total = qty * price;
      if (total > MAX_ROW_TOTAL) continue;
      const key = name + '|' + qty + '|' + total;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ name, qty, price, total });
    }
    if (found.length > rows.length) rows = found;
  }

  // فیلتر نهایی: ردیف‌های بی‌معنی را حذف کن
  rows = rows.filter((r) => {
    if (!r.name || r.name.length < 2) return false;
    if (r.qty < 0 || r.qty > MAX_QTY) return false;
    if (r.total < 0 || r.total > MAX_ROW_TOTAL) return false;
    if (r.price < 0 || r.price > MAX_PRICE) return false;
    // حداقل یکی از qty یا total باید مثبت باشد
    return r.qty > 0 || r.total > 0;
  });

  if (!rows.length) {
    throw new Error(
      'از PDF هیچ ردیف فروشی معتبر استخراج نشد. ترجیحاً فایل اکسل همان فصل را آپلود کنید.'
    );
  }
  return rows;
}
