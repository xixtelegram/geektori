import { WORKER_URL } from '../config.js';

export async function computeSalesHash(rows) {
  const lines = (rows || [])
    .map((r) => `${r.name}|${Number(r.qty) || 0}|${Number(r.total) || 0}`)
    .sort()
    .join('\n');
  const buf = new TextEncoder().encode(lines);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** از نام فایل: «XIXnight - Summer 1405.xlsx» */
export function parseMetaFromFilename(filename) {
  let base = String(filename || 'upload')
    .replace(/\.xlsx\.xls$/i, '')
    .replace(/\.xlsx$/i, '')
    .replace(/\.xls$/i, '')
    .replace(/\.csv$/i, '')
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
  return { designer, season };
}

export async function uploadToGitHub(file, rawRows) {
  if (!WORKER_URL || !rawRows?.length) return;
  try {
    const salesHash = await computeSalesHash(rawRows);
    const { designer, season } = parseMetaFromFilename(file.name);
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('salesHash', salesHash);
    fd.append('designer', designer);
    fd.append('season', season);
    await fetch(WORKER_URL, { method: 'POST', body: fd });
  } catch (err) {
    console.error(err);
  }
}
