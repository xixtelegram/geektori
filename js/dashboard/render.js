import { state } from './state.js';
import { getFilteredProducts, getFilteredFlat } from './filters.js';
import { fmt, fmtMoney, escapeHtml, truncateLabel } from '../shared/format.js';

/** سهم طراح از مبلغ کل فروش */
const DESIGNER_SHARE = 0.3;
const designerIncome = (totalRev) => (totalRev || 0) * DESIGNER_SHARE;

export function renderKPIs() {
  const totalProducts = state.products.length;
  const totalVariants = state.rawRows.length;
  const soldVariants = state.rawRows.filter((r) => r.qty > 0).length;
  const totalQty = state.rawRows.reduce((s, r) => s + r.qty, 0);
  const totalRev = state.rawRows.reduce((s, r) => s + r.total, 0);

  const cards = [
    { label: 'محصول یکتا', value: fmt(totalProducts), icon: '📦' },
    { label: 'واریانت کل', value: fmt(totalVariants), icon: '🧩' },
    { label: 'واریانت فروخته‌شده', value: fmt(soldVariants), icon: '✅' },
    { label: 'تعداد فروش کل', value: fmt(totalQty), icon: '🛒' },
    { label: 'مبلغ کل فروش', value: fmtMoney(totalRev), icon: '💵' },
    { label: 'درآمد طراح (۳۰٪)', value: fmtMoney(designerIncome(totalRev)), icon: '💰' },
  ];

  const el = document.getElementById('kpiCards');
  el.innerHTML = '';
  cards.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'glass-card p-4';
    div.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-medium text-ios-secondary mb-1">${escapeHtml(c.label)}</p>
          <p class="text-lg font-bold leading-tight tracking-tight">${escapeHtml(c.value)}</p>
        </div>
        <span class="text-2xl opacity-90">${c.icon}</span>
      </div>`;
    el.appendChild(div);
  });
}

export function renderCharts() {
  const filtered = getFilteredProducts();
  const topQty = [...filtered].sort((a, b) => b.totalQty - a.totalQty).slice(0, 10).filter((p) => p.totalQty > 0);
  const topRev = [...filtered].sort((a, b) => b.totalRev - a.totalRev).slice(0, 10).filter((p) => p.totalRev > 0);

  const opts = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const i = items[0]?.dataIndex;
            return items[0]?.chart.data.fullLabels?.[i] || items[0]?.label || '';
          },
          label: (ctx) => fmt(ctx.raw),
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { family: 'Vazir', size: 10 }, callback: (v) => fmt(v) },
        grid: { color: '#f1f5f9' },
      },
      y: {
        ticks: { font: { family: 'Vazir', size: 10 }, autoSkip: false },
        grid: { display: false },
      },
    },
  };

  if (state.chartQty) state.chartQty.destroy();
  if (state.chartRev) state.chartRev.destroy();

  state.chartQty = new Chart(document.getElementById('chartQty'), {
    type: 'bar',
    data: {
      labels: topQty.map((p) => truncateLabel(p.name)),
      fullLabels: topQty.map((p) => p.name),
      datasets: [{ data: topQty.map((p) => p.totalQty), backgroundColor: '#0ea5e9', borderRadius: 6, barThickness: 14 }],
    },
    options: opts,
  });

  state.chartRev = new Chart(document.getElementById('chartRev'), {
    type: 'bar',
    data: {
      labels: topRev.map((p) => truncateLabel(p.name)),
      fullLabels: topRev.map((p) => p.name),
      datasets: [{ data: topRev.map((p) => p.totalRev), backgroundColor: '#f43f5e', borderRadius: 6, barThickness: 14 }],
    },
    options: {
      ...opts,
      scales: {
        ...opts.scales,
        x: {
          ...opts.scales.x,
          ticks: {
            ...opts.scales.x.ticks,
            callback: (v) => (v >= 1000 ? v / 1000 + 'k' : fmt(v)),
          },
        },
      },
    },
  });
}

function materialBadgeClass(m) {
  if (!m) return 'bg-violet-100 text-violet-700';
  if (m.includes('سفید')) return 'bg-slate-200 text-slate-700';
  if (m.includes('شفاف')) return 'bg-sky-100 text-sky-700';
  if (m === 'برش') return 'bg-orange-100 text-orange-700';
  if (m === 'کیبورد') return 'bg-indigo-100 text-indigo-700';
  return 'bg-violet-100 text-violet-700';
}

export function renderTable() {
  const container = document.getElementById('tableContainer');
  if (state.currentView === 'grouped') {
    const list = getFilteredProducts();
    document.getElementById('resultCount').textContent = `${fmt(list.length)} محصول`;
    if (!list.length) {
      container.innerHTML = `<div class="p-12 text-center text-slate-400">موردی یافت نشد</div>`;
      return;
    }
    let html = `<table class="w-full text-sm">
      <thead class="bg-slate-50 sticky top-0 z-10">
        <tr class="text-slate-500 text-xs">
          <th class="text-right py-3 px-4 font-semibold">محصول</th>
          <th class="text-center py-3 px-3 font-semibold">واریانت</th>
          <th class="text-center py-3 px-3 font-semibold">فروش</th>
          <th class="text-center py-3 px-3 font-semibold">مبلغ کل فروش</th>
          <th class="text-center py-3 px-3 font-semibold">درآمد طراح (۳۰٪)</th>
          <th class="text-center py-3 px-3 font-semibold">قیمت</th>
          <th class="text-right py-3 px-4 font-semibold">جزئیات</th>
        </tr>
      </thead><tbody>`;
    list.forEach((p) => {
      const priceRange =
        p.minPrice === p.maxPrice
          ? p.maxPrice
            ? fmtMoney(p.maxPrice)
            : '—'
          : `${fmt(p.minPrice)} – ${fmt(p.maxPrice)}`;
      const soldBadge =
        p.totalQty > 0
          ? `<span class="badge bg-emerald-100 text-emerald-700">${fmt(p.totalQty)} فروش</span>`
          : `<span class="badge bg-slate-100 text-slate-500">بدون فروش</span>`;
      const variantsHtml = p.variants
        .map(
          (v) => `
        <div class="flex flex-wrap items-center gap-2 text-xs bg-slate-50 rounded-lg px-3 py-1.5">
          <span class="badge ${materialBadgeClass(v.material)}">${escapeHtml(v.material)}</span>
          <span class="badge bg-amber-50 text-amber-800">${escapeHtml(v.size)}</span>
          <span class="text-slate-500">قیمت: ${v.price ? fmtMoney(v.price) : '—'}</span>
          <span class="font-semibold ${v.qty ? 'text-emerald-600' : 'text-slate-400'}">${v.qty ? fmt(v.qty) + ' عدد' : '۰'}</span>
          ${v.total ? `<span class="text-slate-600">فروش: ${fmtMoney(v.total)}</span><span class="text-brand-700 font-medium">طراح: ${fmtMoney(designerIncome(v.total))}</span>` : ''}
        </div>`
        )
        .join('');
      html += `
        <tr class="table-row border-t border-slate-50 fade-in">
          <td class="py-3 px-4">
            <details>
              <summary class="flex items-center gap-2">
                <span class="chevron text-slate-400 text-xs">▶</span>
                <span class="font-medium text-slate-800">${escapeHtml(p.name)}</span>
                ${soldBadge}
              </summary>
              <div class="mt-2 mr-5 space-y-1.5 pb-2">${variantsHtml}</div>
            </details>
          </td>
          <td class="text-center py-3 px-3 text-slate-600">${fmt(p.variants.length)}</td>
          <td class="text-center py-3 px-3 font-semibold ${p.totalQty ? 'text-emerald-600' : 'text-slate-400'}">${fmt(p.totalQty)}</td>
          <td class="text-center py-3 px-3 font-medium text-slate-700">${p.totalRev ? fmtMoney(p.totalRev) : '—'}</td>
          <td class="text-center py-3 px-3 font-semibold text-brand-700">${p.totalRev ? fmtMoney(designerIncome(p.totalRev)) : '—'}</td>
          <td class="text-center py-3 px-3 text-slate-600 text-xs">${priceRange}</td>
          <td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(p.materials.slice(0, 3).join(' · '))}${p.materials.length > 3 ? '…' : ''}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
  } else {
    const list = getFilteredFlat();
    document.getElementById('resultCount').textContent = `${fmt(list.length)} واریانت`;
    if (!list.length) {
      container.innerHTML = `<div class="p-12 text-center text-slate-400">موردی یافت نشد</div>`;
      return;
    }
    let html = `<table class="w-full text-sm">
      <thead class="bg-slate-50 sticky top-0 z-10">
        <tr class="text-slate-500 text-xs">
          <th class="text-right py-3 px-4 font-semibold">محصول</th>
          <th class="text-center py-3 px-3 font-semibold">جنس</th>
          <th class="text-center py-3 px-3 font-semibold">سایز</th>
          <th class="text-center py-3 px-3 font-semibold">قیمت</th>
          <th class="text-center py-3 px-3 font-semibold">فروش</th>
          <th class="text-center py-3 px-3 font-semibold">مبلغ کل فروش</th>
          <th class="text-center py-3 px-3 font-semibold">درآمد طراح (۳۰٪)</th>
        </tr>
      </thead><tbody>`;
    list.forEach((v) => {
      html += `
        <tr class="table-row border-t border-slate-50 fade-in">
          <td class="py-2.5 px-4 font-medium text-slate-800">${escapeHtml(v.name)}</td>
          <td class="text-center py-2.5 px-3"><span class="badge ${materialBadgeClass(v.material)}">${escapeHtml(v.material)}</span></td>
          <td class="text-center py-2.5 px-3 text-xs text-slate-600">${escapeHtml(v.size)}</td>
          <td class="text-center py-2.5 px-3 text-slate-700">${v.price ? fmtMoney(v.price) : '—'}</td>
          <td class="text-center py-2.5 px-3 font-semibold ${v.qty ? 'text-emerald-600' : 'text-slate-400'}">${fmt(v.qty)}</td>
          <td class="text-center py-2.5 px-3 text-slate-700">${v.total ? fmtMoney(v.total) : '—'}</td>
          <td class="text-center py-2.5 px-3 font-semibold text-brand-700">${v.total ? fmtMoney(designerIncome(v.total)) : '—'}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
  }
}

export function renderAll() {
  renderKPIs();
  renderCharts();
  renderTable();
}

export function refreshView() {
  renderCharts();
  renderTable();
}
