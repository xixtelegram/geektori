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
import { fmt, fmtMoney, escapeHtml as esc } from '../shared/format.js';

/** فقط اکسل — PDF عمداً غیرفعال است (اعداد فروش اشتباه پارس می‌شد) */
const EXCEL_EXT = /\.(xlsx|xls|csv)$/i;
function isExcelFileName(name) {
  return EXCEL_EXT.test(String(name || ''));
}

const DESIGNER_SHARE = 0.3;
const income = (rev) => (rev || 0) * DESIGNER_SHARE;

const session = loadSession();
if (!session?.username) {
  location.href = 'index.html';
}

document.getElementById('designerLabel').textContent = session.displayName || session.username;

let seasonsData = []; // { season, seasonFa, meta, rows, totalQty, totalRev }
let seasonTopQtyChart = null;
let seasonTopRevChart = null;
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
    // فقط فایل‌های اکسل — PDFهای قبلی (اعداد خراب) در پنل نشان داده نمی‌شوند
    seasonsData = (data.seasons || [])
      .filter((s) => {
        const n = s.meta?.originalName || '';
        if (/\.pdf$/i.test(n)) return false;
        return true;
      })
      .map((s) => ({
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
        <th class="px-3 py-2">فصل</th><th class="px-3 py-2">فایل</th><th class="px-3 py-2">فروش</th><th class="px-3 py-2">مبلغ</th><th class="px-3 py-2">آپلود</th><th class="px-3 py-2">عملیات</th>
      </tr></thead><tbody>
      ${seasonsData
        .map((s, idx) => {
          const hash = esc(s.meta?.salesHash || '');
          return `<tr class="border-b border-slate-50">
        <td class="px-3 py-2 font-medium">${esc(s.seasonFa)}</td>
        <td class="px-3 py-2 text-xs">${esc(s.meta?.originalName || '—')}</td>
        <td class="px-3 py-2">${fmt(s.totalQty)}</td>
        <td class="px-3 py-2">${fmtMoney(s.totalRev)}</td>
        <td class="px-3 py-2 text-xs">${s.meta?.uploadedAt ? new Date(s.meta.uploadedAt).toLocaleDateString('fa-IR') : '—'}</td>
        <td class="px-3 py-2">
          <button type="button" data-delete-hash="${hash}" data-delete-idx="${idx}"
            class="delete-file-btn text-xs text-rose-600 hover:text-rose-800 hover:underline px-2 py-1 rounded-lg hover:bg-rose-50">
            حذف
          </button>
        </td>
      </tr>`;
        })
        .join('')}
      </tbody></table>`
    : '<p class="p-4 text-sm text-slate-500">فایلی نیست. از بخش آپلود یا درایو اضافه کنید.</p>';
  document.getElementById('filesTable').innerHTML = tbody;

  document.querySelectorAll('.delete-file-btn').forEach((btn) => {
    btn.onclick = () => handleDeleteFile(btn.dataset.deleteHash, Number(btn.dataset.deleteIdx));
  });
}

async function handleDeleteFile(salesHash, idx) {
  const s = seasonsData[idx];
  const label = s ? `${s.seasonFa} — ${s.meta?.originalName || salesHash}` : salesHash;
  if (!salesHash) {
    alert('شناسه فایل نامعتبر است.');
    return;
  }
  if (!confirm(`حذف این فایل؟\n${label}\n\nبعد از حذف می‌توانید دوباره ایمپورت کنید.`)) return;

  try {
    showLoading(true);
    await api('delete_upload', { salesHash, designer: session.username });
    await loadDesignerData();
  } catch (e) {
    showErr(e.message || String(e));
  } finally {
    showLoading(false);
  }
}

function fillSeasonSelects() {
  const opts =
    `<option value="all">همه فصل‌ها</option>` +
    seasonsData
      .map(
        (s, i) =>
          `<option value="${i}">${esc(s.seasonFa)}${s.meta?.originalName ? ' — ' + esc(s.meta.originalName) : ''}</option>`
      )
      .join('');
  document.getElementById('seasonSelect').innerHTML = opts || '<option value="all">—</option>';
  document.getElementById('compareSeasons').innerHTML = seasonsData
    .map((s, i) => `<option value="${i}">${esc(s.seasonFa)}</option>`)
    .join('');
  renderSeasonDetail('all');
}

document.getElementById('seasonSelect').addEventListener('change', (e) => {
  const v = e.target.value;
  renderSeasonDetail(v === 'all' ? 'all' : Number(v));
});

function shortLabel(name, max = 22) {
  const s = String(name || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function destroyChart(ch) {
  if (ch) {
    try {
      ch.destroy();
    } catch {}
  }
  return null;
}

function renderSeasonDetail(idx) {
  const isAll = idx === 'all' || idx === '' || idx == null;
  let rows = [];
  let totalQty = 0;
  let totalRev = 0;
  let scopeLabel = 'همه فصل‌ها';

  if (isAll) {
    rows = seasonsData.flatMap((s) => s.rows || []);
    totalQty = seasonsData.reduce((a, s) => a + (s.totalQty || 0), 0);
    totalRev = seasonsData.reduce((a, s) => a + (s.totalRev || 0), 0);
  } else {
    const s = seasonsData[idx];
    if (!s) return;
    rows = s.rows || [];
    totalQty = s.totalQty || 0;
    totalRev = s.totalRev || 0;
    scopeLabel = s.seasonFa;
  }

  const products = productAgg(rows);
  const byQty = [...products].filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty);
  const byRev = [...products].filter((p) => p.rev > 0).sort((a, b) => b.rev - a.rev);
  const topQty = byQty[0];
  const topRev = byRev[0];

  const hint = document.getElementById('seasonFilterHint');
  if (hint) hint.textContent = `نمایش: ${scopeLabel} — ۱۰ محصول برتر از نظر تعداد و مبلغ`;

  const kpis = [
    { label: 'محصول یکتا', value: fmt(products.length) },
    { label: isAll ? 'فروش کل' : 'فروش فصل', value: fmt(totalQty) },
    { label: isAll ? 'مبلغ کل' : 'مبلغ فروش', value: fmtMoney(totalRev) },
    { label: 'درآمد (۳۰٪)', value: fmtMoney(income(totalRev)) },
  ];
  document.getElementById('seasonKpis').innerHTML = kpis
    .map(
      (c) => `<div class="glass-card p-3"><p class="text-xs text-slate-500">${esc(c.label)}</p>
      <p class="font-bold text-base">${esc(c.value)}</p></div>`
    )
    .join('');

  const top10Qty = byQty.slice(0, 10);
  const top10Rev = byRev.slice(0, 10);

  const qtyCtx = document.getElementById('seasonTopQtyChart');
  const revCtx = document.getElementById('seasonTopRevChart');
  seasonTopQtyChart = destroyChart(seasonTopQtyChart);
  seasonTopRevChart = destroyChart(seasonTopRevChart);

  if (qtyCtx) {
    seasonTopQtyChart = new Chart(qtyCtx, {
      type: 'bar',
      data: {
        labels: top10Qty.map((p) => shortLabel(p.name)),
        datasets: [
          {
            label: 'تعداد فروش',
            data: top10Qty.map((p) => p.qty),
            backgroundColor: 'rgba(14,165,233,0.75)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = top10Qty[ctx.dataIndex];
                return p ? `فروش: ${fmt(p.qty)} | مبلغ: ${fmtMoney(p.rev)}` : '';
              },
            },
          },
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  if (revCtx) {
    seasonTopRevChart = new Chart(revCtx, {
      type: 'bar',
      data: {
        labels: top10Rev.map((p) => shortLabel(p.name)),
        datasets: [
          {
            label: 'مبلغ فروش',
            data: top10Rev.map((p) => p.rev),
            backgroundColor: 'rgba(16,185,129,0.75)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = top10Rev[ctx.dataIndex];
                return p ? `مبلغ: ${fmtMoney(p.rev)} | فروش: ${fmt(p.qty)}` : '';
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (v) => fmt(v),
            },
          },
        },
      },
    });
  }

  const tableProducts = byQty.length ? byQty : products;
  document.getElementById('seasonProducts').innerHTML = tableProducts.length
    ? `<table class="w-full text-sm"><thead><tr class="text-right text-xs text-slate-500 border-b">
      <th class="px-3 py-2">#</th>
      <th class="px-3 py-2">محصول</th>
      <th class="px-3 py-2">فروش</th>
      <th class="px-3 py-2">مبلغ</th>
      <th class="px-3 py-2">درآمد ۳۰٪</th>
    </tr></thead><tbody>
    ${tableProducts
      .map(
        (p, i) => `<tr class="border-b border-slate-50 ${
          (topQty && p.name === topQty.name) || (topRev && p.name === topRev.name) ? 'bg-brand-50' : ''
        }">
      <td class="px-3 py-2 text-xs text-slate-400">${i + 1}</td>
      <td class="px-3 py-2">${esc(p.name)}</td>
      <td class="px-3 py-2">${fmt(p.qty)}</td>
      <td class="px-3 py-2">${fmtMoney(p.rev)}</td>
      <td class="px-3 py-2">${fmtMoney(income(p.rev))}</td>
    </tr>`
      )
      .join('')}
    </tbody></table>`
    : '<p class="p-4 text-sm text-slate-500">برای این بازه داده‌ای نیست.</p>';
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

// ——— آپلود محلی (فقط اکسل) ———
async function parseFileBuffer(name, buffer) {
  if (!isExcelFileName(name)) {
    throw new Error('فقط فایل اکسل (xlsx / xls / csv) مجاز است. PDF پشتیبانی نمی‌شود.');
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
  const btn = document.getElementById('driveImportBtn');
  const progressWrap = document.getElementById('driveProgressWrap');
  const progressBar = document.getElementById('driveProgressBar');
  const progressText = document.getElementById('driveProgressText');

  log.innerHTML = '';
  const addLog = (t, cls = '') => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = t;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  };

  const setProgress = (current, total, label) => {
    if (progressWrap) progressWrap.classList.remove('hidden');
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    if (progressBar) progressBar.style.width = pct + '%';
    if (progressText) {
      progressText.textContent =
        label || (total ? `${current} از ${total} فایل (${pct}٪)` : 'در حال آماده‌سازی...');
    }
  };

  if (!url) {
    addLog('لینک را وارد کنید', 'text-rose-600');
    return;
  }

  btn.disabled = true;
  btn.classList.add('opacity-60', 'cursor-not-allowed');
  const btnLabel = btn.textContent;
  btn.textContent = 'در حال ایمپورت...';

  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;
  let parseWarnCount = 0;

  setProgress(0, 0, 'در حال دریافت فهرست فایل‌ها از درایو...');
  addLog('در حال دریافت فهرست فایل‌ها از درایو...');

  try {
    const list = await api('drive_list', { folderUrl: url });
    const files = list.files || [];
    if (!files.length) {
      addLog('فایلی پیدا نشد. پوشه باید عمومی باشد و GOOGLE_API_KEY در ورکر تنظیم شده باشد.', 'text-rose-600');
      setProgress(0, 0, 'فایلی پیدا نشد');
      return;
    }

    // فقط اکسل — PDF را از همان ابتدا رد کن (بدون تماس اضافه به Worker)
    const excelFiles = files.filter((f) => isExcelFileName(f.name));
    const pdfSkipped = files.length - excelFiles.length;
    if (pdfSkipped > 0) {
      addLog(`${pdfSkipped} فایل PDF نادیده گرفته شد (فقط اکسل مجاز است).`, 'text-amber-600');
    }
    if (!excelFiles.length) {
      addLog('هیچ فایل اکسلی در پوشه نبود.', 'text-rose-600');
      setProgress(0, 0, 'فایل اکسلی نبود');
      return;
    }

    addLog(`${excelFiles.length} فایل اکسل پیدا شد. شروع دانلود، پارس و آپلود ترتیبی...`);
    setProgress(0, excelFiles.length, `۰ از ${excelFiles.length} فایل`);

    for (let i = 0; i < excelFiles.length; i++) {
      const f = excelFiles[i];
      const n = i + 1;
      setProgress(i, excelFiles.length, `[${n}/${excelFiles.length}] ${f.name}`);
      addLog(`[${n}/${excelFiles.length}] ${f.name} ...`);

      try {
        // ۱) دانلود از ورکر (base64) برای پارس سمت کلاینت
        const fetched = await api('drive_fetch', { fileId: f.id, fileName: f.name });
        if (!fetched?.base64) throw new Error('پاسخ دانلود خالی بود');
        const buffer = b64ToArrayBuffer(fetched.base64);

        let rows = [];
        try {
          rows = await parseFileBuffer(f.name, buffer);
        } catch (parseErr) {
          parseWarnCount++;
          addLog(`  ⚠ پارس نشد (${parseErr.message}) — رد شد`, 'text-amber-600');
          errCount++;
          setProgress(n, excelFiles.length, `[${n}/${excelFiles.length}] خطا در پارس`);
          continue;
        }
        if (!rows?.length) {
          parseWarnCount++;
          addLog(`  ⚠ ردیفی استخراج نشد — رد شد`, 'text-amber-600');
          errCount++;
          setProgress(n, excelFiles.length, `[${n}/${excelFiles.length}] بدون ردیف`);
          continue;
        }

        const summary = (rows || []).map((r) => ({
          name: r.name,
          qty: Number(r.qty) || 0,
          price: Number(r.price) || 0,
          total: Number(r.total) || 0,
        }));

        // ۲) آپلود + ذخیره ردیف‌ها در meta
        const result = await api('drive_import', {
          fileId: f.id,
          fileName: f.name,
          designer: session.username,
          mimeType: f.mimeType,
          rowsJson: JSON.stringify(summary),
        });

        if (result.skipped) {
          skipCount++;
          addLog(`  ⏭ تکراری — رد شد`, 'text-slate-400');
        } else if (result.updated) {
          okCount++;
          const rc = summary.length || result.rowCount || 0;
          addLog(`  ↻ به‌روز شد (بازنویسی داده‌ها)${rc ? ` — ${rc} ردیف` : ''}`, 'text-sky-600');
        } else {
          okCount++;
          const rc = summary.length || result.rowCount || 0;
          addLog(`  ✓ آپلود شد${rc ? ` (${rc} ردیف)` : ''}`, 'text-emerald-600');
        }
      } catch (err) {
        errCount++;
        addLog(`  ✗ ${err.message || err}`, 'text-rose-600');
      }

      setProgress(n, excelFiles.length, `[${n}/${excelFiles.length}] انجام شد`);
    }

    // خلاصه نهایی
    const summaryLine =
      `تمام. موفق: ${okCount} | تکراری: ${skipCount} | خطا: ${errCount}` +
      (pdfSkipped ? ` | PDF ردشده: ${pdfSkipped}` : '') +
      (parseWarnCount ? ` | هشدار پارس: ${parseWarnCount}` : '');
    addLog(summaryLine, errCount ? 'text-rose-700 font-semibold' : 'text-emerald-700 font-semibold');
    setProgress(excelFiles.length, excelFiles.length, summaryLine);

    if (okCount > 0 || skipCount > 0) {
      await loadDesignerData();
    }
  } catch (err) {
    errCount++;
    addLog('خطا: ' + (err.message || err), 'text-rose-600');
    setProgress(0, 0, 'ایمپورت متوقف شد');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
    btn.textContent = btnLabel;
  }
};

// ——— حساب ———
document.getElementById('accName').value = session.displayName || session.username;

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

document.getElementById('saveNameBtn').onclick = async () => {
  const displayName = document.getElementById('accName').value.trim();
  const pass = document.getElementById('accOldPass').value;
  document.getElementById('accErr').classList.add('hidden');
  document.getElementById('accMsg').classList.add('hidden');
  if (!pass) {
    document.getElementById('accErr').textContent = 'برای ذخیره نام، رمز فعلی را وارد کنید.';
    document.getElementById('accErr').classList.remove('hidden');
    return;
  }
  try {
    const passwordHash = await hashPassword(pass, session.username.toLowerCase());
    await api('update_profile', { displayName, passwordHash });
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
  document.getElementById('accMsg').classList.add('hidden');
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
  document.getElementById('accMsg').classList.add('hidden');
  const pass = document.getElementById('accOldPass').value;
  if (!pass) {
    document.getElementById('accErr').textContent = 'برای ساخت کد جدید، رمز فعلی را وارد کنید.';
    document.getElementById('accErr').classList.remove('hidden');
    return;
  }
  try {
    const passwordHash = await hashPassword(pass, session.username.toLowerCase());
    const codes = generateRecoveryCodes(4);
    const recoveryHashes = [];
    for (const c of codes) {
      recoveryHashes.push(await hashPassword(c.replace(/-/g, ''), session.username.toLowerCase() + '-rec'));
    }
    await api('regen_codes', { recoveryHashes, passwordHash });
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
