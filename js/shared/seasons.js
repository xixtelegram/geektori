/** نگاشت فصل انگلیسی → فارسی و استخراج از نام فایل */

const SEASON_MAP = {
  autumn: 'پاییز',
  fall: 'پاییز',
  spring: 'بهار',
  summer: 'تابستان',
  winter: 'زمستان',
  پاییز: 'پاییز',
  بهار: 'بهار',
  تابستان: 'تابستان',
  زمستان: 'زمستان',
};

/** «Autumn 1403» یا «Summer 1405» یا «پاییز 1403» → برچسب فارسی */
export function seasonToFa(raw) {
  if (!raw) return 'نامشخص';
  const s = String(raw).trim();
  if (!s) return 'نامشخص';

  const lower = s.toLowerCase();
  for (const [en, fa] of Object.entries(SEASON_MAP)) {
    if (lower.includes(en.toLowerCase()) || s.includes(fa)) {
      const yearMatch = s.match(/(13|14)\d{2}/);
      const year = yearMatch ? yearMatch[0] : '';
      return year ? `${fa} ${year}` : fa;
    }
  }
  return s;
}

/** کلید یکسان برای گروه‌بندی (بدون سال) */
export function seasonKey(raw) {
  const fa = seasonToFa(raw);
  if (fa.includes('پاییز')) return 'autumn';
  if (fa.includes('بهار')) return 'spring';
  if (fa.includes('تابستان')) return 'summer';
  if (fa.includes('زمستان')) return 'winter';
  return 'unknown';
}

/** از نام فایل: «XIXnight - Autumn 1403.xlsx» یا «.pdf» */
export function parseMetaFromFilename(filename) {
  let base = String(filename || 'upload')
    .replace(/\.(xlsx|xls|csv|pdf)$/i, '')
    .trim();
  const parts = base.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  let designer = 'unknown';
  let season = 'نامشخص';
  if (parts.length >= 2) {
    designer = parts[0];
    season = parts.slice(1).join(' - ');
  } else if (parts.length === 1) {
    designer = parts[0];
  }
  return { designer, season, seasonFa: seasonToFa(season) };
}
