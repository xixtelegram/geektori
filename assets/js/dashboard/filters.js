import { state } from './state.js';

export function buildFilters() {
  const mats = new Set();
  const sizes = new Set();
  state.rawRows.forEach((r) => {
    if (r.material && r.material !== '—') mats.add(r.material);
    if (r.size && r.size !== '—') sizes.add(r.size);
  });

  const matSel = document.getElementById('filterMaterial');
  matSel.innerHTML = '<option value="">همه</option>';
  [...mats].sort((a, b) => a.localeCompare(b, 'fa')).forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    matSel.appendChild(opt);
  });

  const sizeSel = document.getElementById('filterSize');
  sizeSel.innerHTML = '<option value="">همه</option>';
  const sizeOrder = (s) => {
    if (s.includes('۳')) return 1;
    if (s.includes('۵')) return 2;
    if (s.includes('۷')) return 3;
    if (s.includes('۱۰')) return 4;
    if (s.includes('A5')) return 5;
    if (s.includes('A4')) return 6;
    if (s.includes('simple') || s === 'A') return 7;
    return 10;
  };
  [...sizes]
    .sort((a, b) => sizeOrder(a) - sizeOrder(b) || a.localeCompare(b, 'fa'))
    .forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sizeSel.appendChild(opt);
    });
}

export function getFilteredProducts() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const mat = document.getElementById('filterMaterial').value;
  const size = document.getElementById('filterSize').value;
  const minP = Number(document.getElementById('minPrice').value) || 0;
  const maxP = Number(document.getElementById('maxPrice').value) || Infinity;
  const onlySold = document.getElementById('onlySold').checked;
  const sortBy = document.getElementById('sortBy').value;

  let list = state.products
    .map((p) => {
      let vars = p.variants.filter((v) => {
        if (onlySold && v.qty === 0) return false;
        if (mat && v.material !== mat) return false;
        if (size && v.size !== size) return false;
        if (v.price < minP || (v.price > maxP && maxP !== Infinity)) return false;
        return true;
      });
      if (q && !p.name.toLowerCase().includes(q)) return null;
      if (vars.length === 0 && (mat || size || onlySold || minP || maxP < Infinity)) return null;

      const totalQty = vars.reduce((s, v) => s + v.qty, 0);
      const totalRev = vars.reduce((s, v) => s + v.total, 0);
      const maxPrice = Math.max(...vars.map((v) => v.price), 0);
      const minPrice = Math.min(...vars.filter((v) => v.price > 0).map((v) => v.price), Infinity) || 0;

      return {
        ...p,
        variants: vars,
        totalQty,
        totalRev,
        maxPrice,
        minPrice: minPrice === Infinity ? 0 : minPrice,
      };
    })
    .filter(Boolean);

  list.sort((a, b) => {
    switch (sortBy) {
      case 'qty-desc': return b.totalQty - a.totalQty;
      case 'rev-desc': return b.totalRev - a.totalRev;
      case 'price-desc': return b.maxPrice - a.maxPrice;
      case 'price-asc': return a.minPrice - b.minPrice || a.maxPrice - b.maxPrice;
      case 'name-asc': return a.name.localeCompare(b.name, 'fa');
      case 'variants-desc': return b.variants.length - a.variants.length;
      default: return b.totalQty - a.totalQty;
    }
  });
  return list;
}

export function getFilteredFlat() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const mat = document.getElementById('filterMaterial').value;
  const size = document.getElementById('filterSize').value;
  const minP = Number(document.getElementById('minPrice').value) || 0;
  const maxP = Number(document.getElementById('maxPrice').value) || Infinity;
  const onlySold = document.getElementById('onlySold').checked;
  const sortBy = document.getElementById('sortBy').value;

  let list = state.rawRows.filter((v) => {
    if (onlySold && v.qty === 0) return false;
    if (mat && v.material !== mat) return false;
    if (size && v.size !== size) return false;
    if (v.price < minP || (v.price > maxP && maxP !== Infinity)) return false;
    if (q && !v.name.toLowerCase().includes(q)) return false;
    return true;
  });

  list.sort((a, b) => {
    switch (sortBy) {
      case 'qty-desc': return b.qty - a.qty;
      case 'rev-desc': return b.total - a.total;
      case 'price-desc': return b.price - a.price;
      case 'price-asc': return a.price - b.price;
      case 'name-asc': return a.name.localeCompare(b.name, 'fa');
      default: return b.qty - a.qty;
    }
  });
  return list;
}
