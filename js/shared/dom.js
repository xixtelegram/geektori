export function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;
  el.classList.toggle('hidden', !show);
  el.classList.toggle('flex', show);
}

export function showError(msg) {
  alert(msg);
}

export function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden', 'bg-emerald-600', 'bg-rose-600', 'bg-slate-700', 'text-white');
  el.classList.add('text-white');
  if (type === 'ok') el.classList.add('bg-emerald-600');
  else if (type === 'err') el.classList.add('bg-rose-600');
  else el.classList.add('bg-slate-700');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 4500);
}
