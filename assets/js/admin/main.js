import { GITHUB } from '../config.js';
import { fmt, fmtMoney, escapeHtml as esc } from '../shared/format.js';
import { decryptBytes, b64ToBytes } from '../shared/crypto.js';
import { parseExcelBytesSimple } from '../shared/excel.js';

let cfg = { token: '', key: '', owner: '', repo: '', branch: 'main' };
let uploads = []; // { meta, rows, totalQty, totalRev }
let seasonChart = null, cmpQty = null, cmpRev = null;

// ——— Auth ———
function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem('giktori_admin') || 'null');
    if (s?.token && s?.key) {
      cfg = s;
      return true;
    }
  } catch {}
  return false;
}
function saveSession() {
  sessionStorage.setItem('giktori_admin', JSON.stringify(cfg));
}
function clearSession() {
  sessionStorage.removeItem('giktori_admin');
}

document.getElementById('loginBtn').onclick = async () => {
  const err = document.getElementById('loginError');
  err.classList.add('hidden');
  cfg.token = document.getElementById('loginToken').value.trim();
  cfg.key = document.getElementById('loginKey').value.trim();
  cfg.owner = document.getElementById('loginOwner').value.trim();
  cfg.repo = document.getElementById('loginRepo').value.trim();
  if (!cfg.token || !cfg.key || !cfg.owner || !cfg.repo) {
    err.textContent = 'همه فیلدها لازم است.';
    err.classList.remove('hidden');
    return;
  }
  try {
    const res = await gh(`/repos/${cfg.owner}/${cfg.repo}`);
    if (!res.ok) throw new Error('توکن یا دسترسی ریپو نامعتبر است');
    saveSession();
    showApp();
    await loadAll();
  } catch (e) {
    err.textContent = e.message || String(e);
    err.classList.remove('hidden');
  }
};

document.getElementById('logoutBtn').onclick = () => {
  clearSession();
  location.reload();
};

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('repoLabel').textContent = `${cfg.owner}/${cfg.repo}`;
}

// ——— GitHub API ———
async function gh(path, opts = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'giktori-admin-panel',
      ...(opts.headers || {}),
    },
  });
}

async function listDataDir() {
  const res = await gh(`/repos/${cfg.owner}/${cfg.repo}/contents/data?ref=${cfg.branch}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('خواندن فولدر data ناموفق');
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

async function getFileContentBase64(path) {
  const res = await gh(`/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`);
  if (!res.ok) throw new Error('خواندن فایل: ' + path);
  const data = await res.json();
  return data.content.replace(/\n/g, '');
}



// ——— Crypto (همان الگوریتم Worker) ———




// ——— Parse excel from bytes (same logic simplified) ———


// ——— Load all ———
async function loadAll() {
  const bar = document.getElementById('loadingBar');
  bar.classList.remove('hidden');
  uploads = [];
  try {
    const items = await listDataDir();
    const metas = items.filter(i => i.type === 'file' && i.name.endsWith('.meta.json'));
    for (const m of metas) {
      try {
        const metaB64 = await getFileContentBase64(m.path);
        const meta = JSON.parse(new TextDecoder().decode(b64ToBytes(metaB64)));
        const encPath = `data/${meta.salesHash}.enc`;
        const encB64 = await getFileContentBase64(encPath);
        const plain = await decryptBytes(b64ToBytes(encB64), cfg.key);
        const rows = parseExcelBytesSimple(plain);
        const totalQty = rows.reduce((s, r) => s + r.qty, 0);
        const totalRev = rows.reduce((s, r) => s + r.total, 0);
        uploads.push({ meta, rows, totalQty, totalRev });
      } catch (e) {
        console.warn('skip', m.path, e);
      }
    }
    uploads.sort((a, b) => (b.meta.uploadedAt || '').localeCompare(a.meta.uploadedAt || ''));
    renderOverview();
    renderDesignerCards();
    fillCompareSelectors();
  } catch (e) {
    alert('خطا در بارگذاری: ' + (e.message || e));
  } finally {
    bar.classList.add('hidden');
  }
}

document.getElementById('refreshBtn').onclick = () => loadAll();

// ——— Views ———
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.remove('bg-white/20');
      b.classList.add('bg-white/10');
    });
    btn.classList.add('bg-white/20');
    btn.classList.remove('bg-white/10');
    const v = btn.dataset.view;
    ['overview', 'designers', 'compare'].forEach(id => {
      document.getElementById('view-' + id).classList.toggle('hidden', id !== v);
    });
  };
});

function renderOverview() {
  const designers = new Set(uploads.map(u => u.meta.designer));
  const seasons = new Set(uploads.map(u => u.meta.season));
  const totalQty = uploads.reduce((s, u) => s + u.totalQty, 0);
  const totalRev = uploads.reduce((s, u) => s + u.totalRev, 0);
  const kpis = [
    { label: 'تعداد آپلود', value: fmt(uploads.length) },
    { label: 'طراح یکتا', value: fmt(designers.size) },
    { label: 'فصل‌ها', value: fmt(seasons.size) },
    { label: 'فروش کل', value: fmt(totalQty) },
  ];
  document.getElementById('overviewKpis').innerHTML = kpis.map(k => `
    <div class="card bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
      <p class="text-xs text-slate-500 mb-1">${k.label}</p>
      <p class="text-lg font-bold">${k.value}</p>
    </div>
  `).join('');

  const rows = uploads.map(u => `
    <tr class="border-t border-slate-50 hover:bg-slate-50">
      <td class="py-2.5 px-4 font-medium">${esc(u.meta.designer)}</td>
      <td class="py-2.5 px-3 text-sm">${esc(u.meta.season)}</td>
      <td class="py-2.5 px-3 text-sm text-slate-500">${esc(u.meta.originalName || '')}</td>
      <td class="py-2.5 px-3 text-center font-semibold text-emerald-600">${fmt(u.totalQty)}</td>
      <td class="py-2.5 px-3 text-center text-sm">${fmtMoney(u.totalRev)}</td>
      <td class="py-2.5 px-3 text-xs text-slate-400">${esc((u.meta.uploadedAt || '').slice(0, 16).replace('T', ' '))}</td>
    </tr>
  `).join('');

  document.getElementById('uploadsTable').innerHTML = `
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-xs text-slate-500">
        <tr>
          <th class="text-right py-2 px-4">طراح</th>
          <th class="text-right py-2 px-3">فصل</th>
          <th class="text-right py-2 px-3">فایل</th>
          <th class="text-center py-2 px-3">فروش</th>
          <th class="text-center py-2 px-3">درآمد</th>
          <th class="text-right py-2 px-3">تاریخ</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" class="p-8 text-center text-slate-400">هنوز فایلی نیست</td></tr>'}</tbody>
    </table>`;
}



// ——— Designers ———
function byDesigner() {
  const map = new Map();
  uploads.forEach(u => {
    const d = u.meta.designer || 'unknown';
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(u);
  });
  return map;
}

function renderDesignerCards() {
  const map = byDesigner();
  const cards = [...map.entries()].map(([name, list]) => {
    const qty = list.reduce((s, u) => s + u.totalQty, 0);
    const rev = list.reduce((s, u) => s + u.totalRev, 0);
    const seasons = new Set(list.map(u => u.meta.season)).size;
    return `
      <button data-designer="${esc(name)}" class="designer-card card text-right bg-white rounded-2xl border border-slate-100 p-4 shadow-sm w-full">
        <p class="font-bold text-slate-800 mb-1">${esc(name)}</p>
        <p class="text-xs text-slate-500 mb-3">${fmt(list.length)} فایل · ${fmt(seasons)} فصل</p>
        <div class="flex justify-between text-sm">
          <span class="text-emerald-600 font-semibold">${fmt(qty)} فروش</span>
          <span class="text-slate-600">${fmtMoney(rev)}</span>
        </div>
      </button>`;
  }).join('');
  document.getElementById('designerCards').innerHTML = cards || '<p class="text-slate-400 text-sm">طراحی ثبت نشده</p>';
  document.querySelectorAll('.designer-card').forEach(btn => {
    btn.onclick = () => openDesigner(btn.dataset.designer);
  });
}

function openDesigner(name) {
  const list = byDesigner().get(name) || [];
  document.getElementById('designerDetail').classList.remove('hidden');
  document.getElementById('designerTitle').textContent = name;
  const qty = list.reduce((s, u) => s + u.totalQty, 0);
  const rev = list.reduce((s, u) => s + u.totalRev, 0);
  document.getElementById('designerKpis').innerHTML = [
    { l: 'فایل‌ها', v: fmt(list.length) },
    { l: 'فصل‌ها', v: fmt(new Set(list.map(u => u.meta.season)).size) },
    { l: 'فروش کل', v: fmt(qty) },
    { l: 'درآمد کل', v: fmtMoney(rev) },
  ].map(k => `<div class="bg-slate-50 rounded-xl p-3"><p class="text-xs text-slate-500">${k.l}</p><p class="font-bold">${k.v}</p></div>`).join('');

  // season chart
  const seasonMap = new Map();
  list.forEach(u => {
    const s = u.meta.season || 'نامشخص';
    if (!seasonMap.has(s)) seasonMap.set(s, { qty: 0, rev: 0 });
    const o = seasonMap.get(s);
    o.qty += u.totalQty;
    o.rev += u.totalRev;
  });
  const labels = [...seasonMap.keys()];
  const qtyData = labels.map(l => seasonMap.get(l).qty);
  if (seasonChart) seasonChart.destroy();
  seasonChart = new Chart(document.getElementById('designerSeasonChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: qtyData, backgroundColor: '#0ea5e9', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { font: { family: 'Vazir', size: 10 }, callback: v => fmt(v) } },
        x: { ticks: { font: { family: 'Vazir', size: 10 } } }
      }
    }
  });

  document.getElementById('designerFiles').innerHTML = list.map(u => `
    <div class="flex justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2">
      <span>${esc(u.meta.season)} · ${esc(u.meta.originalName || '')}</span>
      <span class="text-emerald-600 font-medium whitespace-nowrap">${fmt(u.totalQty)}</span>
    </div>
  `).join('');

  const sel = document.getElementById('designerSeasonSelect');
  sel.innerHTML = list.map((u, i) => `<option value="${i}">${esc(u.meta.season)} — ${esc(u.meta.originalName || '')}</option>`).join('');
  const renderProducts = (idx) => {
    const u = list[idx];
    if (!u) return;
    const top = [...u.rows].sort((a, b) => b.qty - a.qty).slice(0, 50);
    document.getElementById('designerProducts').innerHTML = `
      <table class="w-full text-sm">
        <thead class="bg-slate-50 sticky top-0 text-xs text-slate-500">
          <tr>
            <th class="text-right py-2 px-3">محصول</th>
            <th class="text-center py-2 px-3">فروش</th>
            <th class="text-center py-2 px-3">قیمت</th>
            <th class="text-center py-2 px-3">مجموع</th>
          </tr>
        </thead>
        <tbody>
          ${top.map(r => `
            <tr class="border-t border-slate-50">
              <td class="py-2 px-3">${esc(r.name)}</td>
              <td class="text-center py-2 px-3 font-semibold text-emerald-600">${fmt(r.qty)}</td>
              <td class="text-center py-2 px-3">${r.price ? fmtMoney(r.price) : '—'}</td>
              <td class="text-center py-2 px-3">${r.total ? fmtMoney(r.total) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  };
  sel.onchange = () => renderProducts(Number(sel.value));
  renderProducts(0);
}

document.getElementById('closeDesigner').onclick = () => {
  document.getElementById('designerDetail').classList.add('hidden');
};

// ——— Compare ———
function fillCompareSelectors() {
  const seasons = [...new Set(uploads.map(u => u.meta.season))].sort();
  const designers = [...new Set(uploads.map(u => u.meta.designer))].sort((a, b) => a.localeCompare(b, 'fa'));
  document.getElementById('compareSeason').innerHTML =
    `<option value="">همه فصل‌ها</option>` + seasons.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  document.getElementById('compareDesigners').innerHTML =
    designers.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
}

document.getElementById('runCompare').onclick = () => {
  const season = document.getElementById('compareSeason').value;
  const sel = document.getElementById('compareDesigners');
  const chosen = [...sel.selectedOptions].map(o => o.value);
  if (!chosen.length) {
    alert('حداقل یک طراح انتخاب کنید');
    return;
  }

  const stats = chosen.map(name => {
    let list = uploads.filter(u => u.meta.designer === name);
    if (season) list = list.filter(u => u.meta.season === season);
    const qty = list.reduce((s, u) => s + u.totalQty, 0);
    const rev = list.reduce((s, u) => s + u.totalRev, 0);
    const files = list.length;
    return { name, qty, rev, files };
  });

  if (cmpQty) cmpQty.destroy();
  if (cmpRev) cmpRev.destroy();
  const labels = stats.map(s => s.name);
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { ticks: { font: { family: 'Vazir', size: 10 }, callback: v => fmt(v) } },
      x: { ticks: { font: { family: 'Vazir', size: 10 } } }
    }
  };
  cmpQty = new Chart(document.getElementById('compareQtyChart'), {
    type: 'bar',
    data: { labels, datasets: [{ data: stats.map(s => s.qty), backgroundColor: '#0ea5e9', borderRadius: 6 }] },
    options: opts
  });
  cmpRev = new Chart(document.getElementById('compareRevChart'), {
    type: 'bar',
    data: { labels, datasets: [{ data: stats.map(s => s.rev), backgroundColor: '#f43f5e', borderRadius: 6 }] },
    options: {
      ...opts,
      scales: {
        ...opts.scales,
        y: { ticks: { font: { family: 'Vazir', size: 10 }, callback: v => (v >= 1000 ? (v / 1000) + 'k' : fmt(v)) } }
      }
    }
  });

  document.getElementById('compareTable').innerHTML = `
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-xs text-slate-500">
        <tr>
          <th class="text-right py-2 px-4">طراح</th>
          <th class="text-center py-2 px-3">تعداد فایل</th>
          <th class="text-center py-2 px-3">فروش</th>
          <th class="text-center py-2 px-3">درآمد</th>
        </tr>
      </thead>
      <tbody>
        ${stats.map(s => `
          <tr class="border-t border-slate-50">
            <td class="py-2.5 px-4 font-medium">${esc(s.name)}</td>
            <td class="text-center py-2.5 px-3">${fmt(s.files)}</td>
            <td class="text-center py-2.5 px-3 font-semibold text-emerald-600">${fmt(s.qty)}</td>
            <td class="text-center py-2.5 px-3">${fmtMoney(s.rev)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
};

// boot
if (loadSession()) {
  showApp();
  loadAll();
}


// defaults on login form
const ownerEl = document.getElementById('loginOwner');
const repoEl = document.getElementById('loginRepo');
if (ownerEl && !ownerEl.value) ownerEl.value = GITHUB.owner;
if (repoEl && !repoEl.value) repoEl.value = GITHUB.repo;

