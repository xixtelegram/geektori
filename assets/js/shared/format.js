export const fmt = (n) => new Intl.NumberFormat('fa-IR').format(n || 0);
export const fmtMoney = (n) => fmt(n) + ' تومان';

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncateLabel(name, max = 18) {
  if (!name || name.length <= max) return name;
  return name.slice(0, max - 1) + '…';
}
