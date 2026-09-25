import { state } from './state.js';
import { parseWorkbookData } from '../shared/excel.js';
import { showLoading, showError } from '../shared/dom.js';
import { buildFilters, getFilteredProducts, getFilteredFlat } from './filters.js';
import { renderAll, refreshView, renderTable } from './render.js';
import { uploadToGitHub } from './upload.js';

function applyWorkbook(wb, fileLabel) {
  const { rawRows, products } = parseWorkbookData(wb);
  state.rawRows = rawRows;
  state.products = products;
  document.getElementById('fileName').textContent = fileLabel || 'فایل بارگذاری‌شده';
  buildFilters();
  renderAll();
  document.getElementById('uploadZone').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
}

function handleFile(file) {
  if (!file) return;
  showLoading(true);
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      applyWorkbook(wb, file.name);
      uploadToGitHub(file, state.rawRows);
    } catch (err) {
      showError(
        'خطا در خواندن فایل: ' +
          (err.message || err) +
          '\nمطمئن شوید فایل اکسل معتبر است و ستون‌های استاندارد دارد.'
      );
      console.error(err);
    } finally {
      showLoading(false);
    }
  };
  reader.onerror = () => {
    showError('خطا در خواندن فایل از دیسک.');
    showLoading(false);
  };
  reader.readAsArrayBuffer(file);
}

function getExportData() {
  if (state.currentView === 'grouped') {
    const list = getFilteredProducts();
    return {
      headers: ['محصول', 'تعداد واریانت', 'فروش کل', 'درآمد کل', 'کمترین قیمت', 'بیشترین قیمت'],
      rows: list.map((p) => [p.name, p.variants.length, p.totalQty, p.totalRev, p.minPrice, p.maxPrice]),
    };
  }
  const list = getFilteredFlat();
  return {
    headers: ['محصول', 'جنس', 'سایز', 'قیمت', 'فروش', 'مجموع'],
    rows: list.map((v) => [v.name, v.material, v.size, v.price, v.qty, v.total]),
  };
}

function bindEvents() {
  document.getElementById('fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
  document.getElementById('fileInput2').addEventListener('change', (e) => handleFile(e.target.files[0]));

  const dropZone = document.getElementById('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add('border-brand-500', 'bg-brand-50');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-brand-500', 'bg-brand-50');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  ['searchInput', 'filterMaterial', 'filterSize', 'minPrice', 'maxPrice', 'sortBy', 'onlySold'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', refreshView);
    el.addEventListener('change', refreshView);
  });

  document.getElementById('resetFilters').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterMaterial').value = '';
    document.getElementById('filterSize').value = '';
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    document.getElementById('sortBy').value = 'qty-desc';
    document.getElementById('onlySold').checked = true;
    refreshView();
  });

  document.getElementById('viewGrouped').addEventListener('click', () => {
    state.currentView = 'grouped';
    document.getElementById('viewGrouped').classList.add('bg-white', 'shadow', 'font-medium', 'active');
    document.getElementById('viewGrouped').classList.remove('text-slate-600');
    document.getElementById('viewFlat').classList.remove('bg-white', 'shadow', 'font-medium', 'active');
    document.getElementById('viewFlat').classList.add('text-slate-600');
    renderTable();
  });
  document.getElementById('viewFlat').addEventListener('click', () => {
    state.currentView = 'flat';
    document.getElementById('viewFlat').classList.add('bg-white', 'shadow', 'font-medium', 'active');
    document.getElementById('viewFlat').classList.remove('text-slate-600');
    document.getElementById('viewGrouped').classList.remove('bg-white', 'shadow', 'font-medium', 'active');
    document.getElementById('viewGrouped').classList.add('text-slate-600');
    renderTable();
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const { headers, rows } = getExportData();
    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach((r) => {
      csv += r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sticker-export.csv';
    a.click();
  });

  document.getElementById('exportXlsxBtn').addEventListener('click', () => {
    const { headers, rows } = getExportData();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'خروجی');
    XLSX.writeFile(wb, 'sticker-export.xlsx');
  });

  document.addEventListener('keydown', (e) => {
    if (
      e.key === '/' &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'SELECT'
    ) {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
    }
  });
}

bindEvents();
