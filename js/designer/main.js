/** پنل پروفایل طراح */

import { WORKER_URL } from '../config.js';
import {
  hashPassword,
  generateRecoveryCodes,
  loadSession,
  saveSession,
  clearSession,
} from '../shared/auth.js';
import { seasonToFa, parseMetaFromFilename } from '../shared/seasons.js';
import { parseExcelBytesSimple } from '../shared/excel.js';
import { parsePdfBytes } from '../shared/pdf.js';
import { fmt, fmtMoney, escapeHtml as esc } from '../shared/format.js';

const DESIGNER_SHARE = 0.3;
const income = (rev) => (rev || 0) * DESIGNER_SHARE;

const session = loadSession();
if (!session?.username) {
  location.href = 'index.html';
}

document.getElementById('designerLabel').textContent = session.displayName || session.username;

let seasonsData = []; // { season, seasonFa, meta, rows, totalQty, totalRev }
let seasonChart = null;
let cmpQtyChart = null;
let cmpRevChart = null;

function showLoading(on) {
  document.getElementById('loadingBar').classList.toggle('hidden', !on);
}
function showErr(msg) {
  const el = document.getElementById('globalErr');
  if (!msg) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function api(action, body = {}) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, username: session.username, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'خطای سرور');
  return data;
}

// ——— ناوبری ———
document.querySelectorAll('.view-nav').forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view;
    document.querySelectorAll('.view-nav').forEach((b) => {
      b.classList.remove('bg-black/5', 'font-semibold', 'text-slate-800');
      b.classList.add('bg-transparent', 'text-slate-600');
    });
    btn.classList.add('bg-black/5', 'font-semibold', 'text-slate-800');
    btn.classList.remove('bg-transparent', 'text-slate-600');
    ['overview', 'seasons', 'compare', 'import', 'account'].forEach((id) => {
      document.getElementById('view-' + id).classList.toggle('hidden', id !== v);
    });
  });
});

document.getElementById('logoutBtn').onclick = () => {
  clearSession();
  location.href = 'index.html';
};

// ——— بارگذاری داده‌های فروش طراح ———
async function loadDesignerData() {
  showLoading(true);
  showErr('');
  try {
    const data = await api('designer_data', { designer: session.username });
    seasonsData = (data.seasons || []).map((s) => ({
      ...s,
      seasonFa: seasonToFa(s.season),
      totalQty: (s.rows || []).reduce((a, r) => a + (Number(r.qty) || 0), 0),
      totalRev: (s.rows || []).reduce((a, r) => a + (Number(r.total) || 0), 0),
    }));
    // مرتب‌سازی بر اساس تاریخ آپلود
    seasonsData.sort((a, b) => String(b.meta?.uploadedAt || '').localeCompare(String(a.meta?.uploadedAt || '')));
    renderOverview();
    fillSeasonSelects();
  } catch (e) {
    showErr(e.message || String(e));
  } finally {
    showLoading(false);
  }
}

function productAgg(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const name = r.name || '—';
    if (!map.has(name)) map.set(name, { name, qty: 0, rev: 0 });
    const p = map.get(name);
    p.qty += Number(r.qty) || 0;
    p.rev += Number(r.total) || 0;
  }
  return [...map.values()];
}

function renderOverview() {
  const allRows = seasonsData.flatMap((s) => s.rows || []);
  const totalQty = allRows.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const totalRev = allRows.reduce((a, r) => a + (Number(r.total) || 0), 0);
  const products = productAgg(allRows);
  const top = [...products].sort((a, b) => b.qty - a.qty)[0];

  const kpis = [
    { label: 'تعداد فصل‌ها', value: fmt(seasonsData.length), icon: '📅' },
    { label: 'فروش کل', value: fmt(totalQty), icon: '🛒' },
    { label: 'مبلغ کل فروش', value: fmtMoney(totalRev), icon: '💵' },
    { label: 'درآمد شما (۳۰٪)', value: fmtMoney(income(totalRev)), icon: '💰' },
  ];
  document.getElementById('overviewKpis').innerHTML = kpis
    .map(
      (c) => `
    <div class="glass-card p-4">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-medium text-ios-secondary mb-1">${esc(c.label)}</p>
          <p class="text-lg font-bold leading-tight">${esc(c.value)}</p>
        </div>
        <span class="text-2xl opacity-90">${c.icon}</span>
      </div>
    </div>`
    )
    .join('');

  const topEl = document.getElementById('topAllTime');
  if (top && top.qty > 0) {
    topEl.innerHTML = `<span class="font-bold text-slate-800">${esc(top.name)}</span>
      — فروش: <b>${fmt(top.qty)}</b> | مبلغ: <b>${fmtMoney(top.rev)}</b> | درآمد: <b>${fmtMoney(income(top.rev))}</b>`;
  } else {
    topEl.textContent = 'هنوز داده‌ای ثبت نشده است.';
  }

  const tbody = seasonsData.length
    ? `<table class="w-full text-sm"><thead><tr class="text-right text-xs text-slate-500 border-b">
        <th class="px-3 py-2">فصل</th><th class="px-3 py-2">فایل</th><th class="px-3 py-2">فروش</th><th class="px-3 py-2">مبلغ</th><th class="px-3 py-2">آپلود</th>
      </tr></thead><tbody>
      ${seasonsData
        .map(
          (s) => `<tr class="border-b border-slate-50">
        <td class="px-3 py-2 font-medium">${esc(s.seasonFa)}</td>
        <td class="px-3 py-2 text-xs">${esc(s.meta?.originalName || '—')}</td>
        <td class="px-3 py-2">${fmt(s.totalQty)}</td>
        <td class="px-3 py-2">${fmtMoney(s.totalRev)}</td>
        <td class="px-3 py-2 text-xs">${s.meta?.uploadedAt ? new Date(s.meta.uploadedAt).toLocaleDateString('fa-IR') : '—'}</td>
      </tr>`
        )
        .join('')}
      </tbody></table>`
    : '<p class="p-4 text-sm text-slate-500">فایلی نیست. از بخش آپلود یا درایو اضافه کنید.</p>';
  document.getElementById('filesTable').innerHTML = tbody;
}

function fillSeasonSelects() {
  const opts = seasonsData
    .map((s, i) => `<option value="${i}">${esc(s.seasonFa)} (${esc(s.meta?.originalName || '')})</option>`)
    .join('');
  document.getElementById('seasonSelect').innerHTML = opts || '<option value="">—</option>';
  document.getElementById('compareSeasons').innerHTML = seasonsData
    .map((s, i) => `<option value="${i}">${esc(s.seasonFa)}</option>`)
    .join('');
  if (seasonsData.length) renderSeasonDetail(0);
}

document.getElementById('seasonSelect').addEventListener('change', (e) => {
  renderSeasonDetail(Number(e.target.value));
});

function renderSeasonDetail(idx) {
  const s = seasonsData[idx];
  if (!s) return;
  const products = productAgg(s.rows).sort((a, b) => b.qty - a.qty);
  const top = products[0];

  const kpis = [
    { label: 'محصول یکتا', value: fmt(products.length) },
    { label: 'فروش فصل', value: fmt(s.totalQty) },
    { label: 'مبلغ فروش', value: fmtMoney(s.totalRev) },
    { label: 'درآمد (۳۰٪)', value: fmtMoney(income(s.totalRev)) },
  ];
  document.getElementById('seasonKpis').innerHTML = kpis
    .map(
      (c) => `<div class="glass-card p-3"><p class="text-xs text-slate-500">${esc(c.label)}</p>
      <p class="font-bold text-base">${esc(c.value)}</p></div>`
    )
    .join('');

  const top10 = products.slice(0, 10).filter((p) => p.qty > 0);
  const ctx = document.getElementById('seasonTopChart');
  if (seasonChart) seasonChart.destroy();
  seasonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map((p) => (p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name)),
      datasets: [{ label: 'فروش', data: top10.map((p) => p.qty), backgroundColor: 'rgba(14,165,233,0.7)' }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });

  document.getElementById('seasonProducts').innerHTML = `
    <table class="w-full text-sm"><thead><tr class="text-right text-xs text-slate-500 border-b">
      <th class="px-3 py-2">محصول</th><th class="px-3 py-2">فروش</th><th class="px-3 py-2">مبلغ</th><th class="px-3 py-2">درآمد</th>
    </tr></thead><tbody>
    ${products
      .map(
        (p) => `<tr class="border-b border-slate-50 ${top && p.name === top.name ? 'bg-brand-50' : ''}">
      <td class="px-3 py-2">${esc(p.name)}</td>
      <td class="px-3 py-2">${fmt(p.qty)}</td>
      <td class="px-3 py-2">${fmtMoney(p.rev)}</td>
      <td class="px-3 py-2">${fmtMoney(income(p.rev))}</td>
    </tr>`
      )
      .join('')}
    </tbody></table>`;
}

document.getElementById('runCompare').onclick = () => {
  const sel = [...document.getElementById('compareSeasons').selectedOptions].map((o) => Number(o.value));
  if (sel.length < 2) {
    alert('حداقل دو فصل انتخاب کنید.');
    return;
  }
  const items = sel.map((i) => seasonsData[i]).filter(Boolean);
  const labels = items.map((s) => s.seasonFa);
  const qtys = items.map((s) => s.totalQty);
  const revs = items.map((s) => income(s.totalRev));

  if (cmpQtyChart) cmpQtyChart.destroy();
  if (cmpRevChart) cmpRevChart.destroy();
  cmpQtyChart = new Chart(document.getElementById('cmpQtyChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'فروش', data: qtys, backgroundColor: 'rgba(14,165,233,0.7)' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
  cmpRevChart = new Chart(document.getElementById('cmpRevChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'درآمد', data: revs, backgroundColor: 'rgba(16,185,129,0.7)' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  document.getElementById('cmpTable').innerHTML = `
    <table class="w-full text-sm"><thead><tr class="text-right text-xs text-slate-500 border-b">
      <th class="px-3 py-2">فصل</th><th class="px-3 py-2">فروش</th><th class="px-3 py-2">مبلغ</th><th class="px-3 py-2">درآمد ۳۰٪</th><th class="px-3 py-2">محصول برتر</th>
    </tr></thead><tbody>
    ${items
      .map((s) => {
        const top = productAgg(s.rows).sort((a, b) => b.qty - a.qty)[0];
        return `<tr class="border-b border-slate-50">
        <td class="px-3 py-2 font-medium">${esc(s.seasonFa)}</td>
        <td class="px-3 py-2">${fmt(s.totalQty)}</td>
        <td class="px-3 py-2">${fmtMoney(s.totalRev)}</td>
        <td class="px-3 py-2">${fmtMoney(income(s.totalRev))}</td>
        <td class="px-3 py-2 text-xs">${top ? esc(top.name) + ' (' + fmt(top.qty) + ')' : '—'}</td>
      </tr>`;
      })
      .join('')}
    </tbody></table>`;
};

// ——— آپلود محلی ———
async function parseFileBuffer(name, buffer) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) {
    return parsePdfBytes(buffer, window.pdfjsLib);
  }
  return parseExcelBytesSimple(new Uint8Array(buffer));
}

async function uploadParsed(file, rows) {
  const { season } = parseMetaFromFilename(file.name);
  const forceDesigner = session.username;
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('designer', forceDesigner);
  fd.append('season', season || 'نامشخص');
  const lines = rows.map((r) => `${r.name}|${Number(r.qty) || 0}|${Number(r.total) || 0}`).sort().join('\n');
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines));
  const salesHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  fd.append('salesHash', salesHash);
  // خلاصه ردیف‌ها برای نمایش در پنل بدون نیاز به پارس اکسل در Worker
  const summary = rows.map((r) => ({
    name: r.name,
    qty: Number(r.qty) || 0,
    price: Number(r.price) || 0,
    total: Number(r.total) || 0,
  }));
  fd.append('rowsJson', JSON.stringify(summary));
  const res = await fetch(WORKER_URL, { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'آپلود ناموفق');
  return data;
}

document.getElementById('localFile').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  const st = document.getElementById('localStatus');
  if (!files.length) return;
  st.textContent = 'در حال پردازش...';
  let ok = 0;
  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      const rows = await parseFileBuffer(file.name, buf);
      if (!rows?.length) throw new Error('ردیفی استخراج نشد');
      await uploadParsed(file, rows);
      ok++;
      st.textContent = `آپلود شد: ${file.name} (${ok}/${files.length})`;
    } catch (err) {
      st.textContent = `خطا در ${file.name}: ${err.message}`;
    }
  }
  await loadDesignerData();
});

// ——— گوگل درایو ———
document.getElementById('driveImportBtn').onclick = async () => {
  const url = document.getElementById('driveUrl').value.trim();
  const log = document.getElementById('driveLog');
  log.innerHTML = '';
  const addLog = (t, cls = '') => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = t;
    log.appendChild(d);
  };
  if (!url) {
    addLog('لینک را وارد کنید', 'text-rose-600');
    return;
  }
  addLog('در حال دریافت فهرست فایل‌ها از درایو...');
  try {
    const list = await api('drive_list', { folderUrl: url });
    const files = list.files || [];
    if (!files.length) {
      addLog('فایلی پیدا نشد. پوشه باید عمومی باشد و GOOGLE_API_KEY در ورکر تنظیم شده باشد.');
      return;
    }
    addLog(`${files.length} فایل پیدا شد. شروع آپلود ترتیبی...`);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      addLog(`[${i + 1}/${files.length}] ${f.name} ...`);
      try {
        const result = await api('drive_import', {
          fileId: f.id,
          fileName: f.name,
          designer: session.username,
          mimeType: f.mimeType,
        });
        if (result.skipped) addLog(`  ⏭ تکراری — رد شد`, 'text-slate-400');
        else addLog(`  ✓ آپلود شد`, 'text-emerald-600');
      } catch (err) {
        addLog(`  ✗ ${err.message}`, 'text-rose-600');
      }
    }
    addLog('تمام.');
    await loadDesignerData();
  } catch (err) {
    addLog('خطا: ' + (err.message || err), 'text-rose-600');
  }
};

// ——— حساب ———
document.getElementById('accName').value = session.displayName || session.username;

document.getElementById('saveNameBtn').onclick = async () => {
  const displayName = document.getElementById('accName').value.trim();
  document.getElementById('accErr').classList.add('hidden');
  try {
    await api('update_profile', { displayName });
    session.displayName = displayName;
    saveSession(session);
    document.getElementById('designerLabel').textContent = displayName;
    const m = document.getElementById('accMsg');
    m.textContent = 'نام ذخیره شد.';
    m.classList.remove('hidden');
  } catch (e) {
    document.getElementById('accErr').textContent = e.message;
    document.getElementById('accErr').classList.remove('hidden');
  }
};

document.getElementById('savePassBtn').onclick = async () => {
  const oldPass = document.getElementById('accOldPass').value;
  const newPass = document.getElementById('accNewPass').value;
  document.getElementById('accErr').classList.add('hidden');
  if (newPass.length < 6) {
    document.getElementById('accErr').textContent = 'رمز جدید حداقل ۶ کاراکتر.';
    document.getElementById('accErr').classList.remove('hidden');
    return;
  }
  try {
    const oldHash = await hashPassword(oldPass, session.username.toLowerCase());
    const newHash = await hashPassword(newPass, session.username.toLowerCase());
    await api('change_password', { oldPasswordHash: oldHash, passwordHash: newHash });
    document.getElementById('accMsg').textContent = 'رمز تغییر کرد.';
    document.getElementById('accMsg').classList.remove('hidden');
    document.getElementById('accOldPass').value = '';
    document.getElementById('accNewPass').value = '';
  } catch (e) {
    document.getElementById('accErr').textContent = e.message;
    document.getElementById('accErr').classList.remove('hidden');
  }
};

document.getElementById('regenCodesBtn').onclick = async () => {
  document.getElementById('accErr').classList.add('hidden');
  try {
    const codes = generateRecoveryCodes(4);
    const recoveryHashes = [];
    for (const c of codes) {
      recoveryHashes.push(await hashPassword(c.replace(/-/g, ''), session.username.toLowerCase() + '-rec'));
    }
    await api('regen_codes', { recoveryHashes });
    const list = document.getElementById('newCodesList');
    list.innerHTML = codes.map((c) => `<li class="bg-black/5 rounded-xl py-2 tracking-widest">${c}</li>`).join('');
    list.classList.remove('hidden');
    document.getElementById('accMsg').textContent = 'کدهای جدید ساخته شد — حتماً ذخیره کنید.';
    document.getElementById('accMsg').classList.remove('hidden');
  } catch (e) {
    document.getElementById('accErr').textContent = e.message;
    document.getElementById('accErr').classList.remove('hidden');
  }
};

loadDesignerData();
