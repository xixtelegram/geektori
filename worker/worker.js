/**
 * Cloudflare Worker — آپلود رمزشده + احراز هویت طراح + ایمپورت گوگل درایو
 *
 * متغیرها را پایین پر کن:
 * GITHUB_TOKEN, OWNER, REPO, BRANCH, ENCRYPTION_KEY
 * GOOGLE_API_KEY (اختیاری — برای لیست پوشه عمومی درایو)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const GITHUB_TOKEN = 'TOKEN_HERE';
const GITHUB_OWNER = 'xixtelegram';
const GITHUB_REPO = 'geektori';
const GITHUB_BRANCH = 'main';
const ENCRYPTION_KEY = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET';
/** کلید API گوگل (Drive API v3) — برای پوشه‌های عمومی */
const GOOGLE_API_KEY = '';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'فقط POST مجاز است' }, 405);
    }
    if (!GITHUB_TOKEN || GITHUB_TOKEN === 'TOKEN_HERE') {
      return json({ error: 'توکن را داخل کد Worker بگذار' }, 500);
    }
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.startsWith('CHANGE_ME')) {
      return json({ error: 'ENCRYPTION_KEY را تنظیم کن' }, 500);
    }

    const ct = request.headers.get('content-type') || '';

    try {
      // JSON API (auth + drive + designer_data)
      if (ct.includes('application/json')) {
        const body = await request.json();
        return await handleJsonAction(body);
      }

      // FormData upload (فایل فروش)
      const form = await request.formData();
      return await handleFileUpload(form);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
  },
};

async function handleJsonAction(body) {
  const action = body.action;
  switch (action) {
    case 'register':
      return registerUser(body);
    case 'login':
      return loginUser(body);
    case 'recover':
      return recoverUser(body);
    case 'update_profile':
      return updateProfile(body);
    case 'change_password':
      return changePassword(body);
    case 'regen_codes':
      return regenCodes(body);
    case 'designer_data':
      return designerData(body);
    case 'drive_list':
      return driveList(body);
    case 'drive_import':
      return driveImport(body);
    default:
      return json({ error: 'action نامعتبر' }, 400);
  }
}

// ——— Users (users/{slug}.json در گیت‌هاب) ———
function userSlug(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 64) || 'unknown';
}

async function getUser(username) {
  const slug = userSlug(username);
  const file = await githubGet(`users/${slug}.json`);
  if (!file || !file.content) return null;
  const text = atob(file.content.replace(/\n/g, ''));
  return { ...JSON.parse(text), _sha: file.sha, _slug: slug };
}

async function saveUser(user, message) {
  const slug = user._slug || userSlug(user.username);
  const { _sha, _slug, ...data } = user;
  const content = arrayBufferToBase64(new TextEncoder().encode(JSON.stringify(data, null, 2)));
  await putFile(`users/${slug}.json`, content, message || `user: ${slug}`, _sha);
}

async function registerUser({ username, passwordHash, recoveryHashes, displayName }) {
  if (!username || !passwordHash) return json({ error: 'نام و رمز لازم است' }, 400);
  const existing = await getUser(username);
  if (existing) return json({ error: 'این نام کاربری قبلاً ثبت شده' }, 409);
  const user = {
    username: String(username).trim(),
    displayName: String(displayName || username).trim(),
    passwordHash,
    recoveryHashes: Array.isArray(recoveryHashes) ? recoveryHashes : [],
    createdAt: new Date().toISOString(),
  };
  await saveUser({ ...user, _slug: userSlug(username) }, `register: ${username}`);
  return json({ ok: true, username: user.username, displayName: user.displayName });
}

async function loginUser({ username, passwordHash }) {
  const user = await getUser(username);
  if (!user || user.passwordHash !== passwordHash) {
    return json({ error: 'نام کاربری یا رمز اشتباه است' }, 401);
  }
  return json({ ok: true, username: user.username, displayName: user.displayName });
}

async function recoverUser({ username, codeHash, passwordHash }) {
  const user = await getUser(username);
  if (!user) return json({ error: 'کاربر یافت نشد' }, 404);
  const idx = (user.recoveryHashes || []).indexOf(codeHash);
  if (idx < 0) return json({ error: 'کد بازیابی نامعتبر یا مصرف‌شده' }, 401);
  user.recoveryHashes.splice(idx, 1);
  user.passwordHash = passwordHash;
  await saveUser(user, `recover: ${username}`);
  return json({ ok: true, username: user.username, displayName: user.displayName });
}

async function updateProfile({ username, displayName }) {
  const user = await getUser(username);
  if (!user) return json({ error: 'کاربر یافت نشد' }, 404);
  user.displayName = String(displayName || user.username).trim();
  await saveUser(user, `profile: ${username}`);
  return json({ ok: true, displayName: user.displayName });
}

async function changePassword({ username, oldPasswordHash, passwordHash }) {
  const user = await getUser(username);
  if (!user) return json({ error: 'کاربر یافت نشد' }, 404);
  if (user.passwordHash !== oldPasswordHash) return json({ error: 'رمز فعلی اشتباه است' }, 401);
  user.passwordHash = passwordHash;
  await saveUser(user, `password: ${username}`);
  return json({ ok: true });
}

async function regenCodes({ username, recoveryHashes }) {
  const user = await getUser(username);
  if (!user) return json({ error: 'کاربر یافت نشد' }, 404);
  user.recoveryHashes = Array.isArray(recoveryHashes) ? recoveryHashes : [];
  await saveUser(user, `regen codes: ${username}`);
  return json({ ok: true });
}

// ——— داده‌های فروش طراح (خواندن meta + decrypt) ———
async function designerData({ designer }) {
  const name = String(designer || '').trim();
  if (!name) return json({ error: 'designer لازم است' }, 400);

  const items = await listDataDir();
  const metas = items.filter((i) => i.name.endsWith('.meta.json'));
  const seasons = [];

  for (const m of metas) {
    try {
      const metaContent = await getFileContentBase64(m.path);
      const meta = JSON.parse(new TextDecoder().decode(b64ToBytes(metaContent)));
      if (String(meta.designer || '').toLowerCase() !== name.toLowerCase()) continue;
      // ردیف‌ها از meta.rows (هنگام آپلود از پنل طراح ذخیره می‌شود)
      const rows = Array.isArray(meta.rows) ? meta.rows : [];
      seasons.push({ season: meta.season, meta, rows });
    } catch {
      // فایل خراب را رد کن
    }
  }
  return json({ ok: true, seasons });
}

// ——— آپلود فایل (FormData) ———
async function handleFileUpload(form) {
  const file = form.get('file');
  let salesHash = String(form.get('salesHash') || '').trim().toLowerCase();
  const designer = sanitizeFilename(String(form.get('designer') || 'unknown').trim() || 'unknown');
  const season = sanitizeFilename(String(form.get('season') || '').trim() || 'نامشخص');

  if (!file || typeof file === 'string') {
    return json({ error: 'فایل ارسال نشده' }, 400);
  }

  const buffer = await file.arrayBuffer();
  if (!salesHash || salesHash.length < 16) {
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
    salesHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const shortHash = salesHash.slice(0, 16);

  const duplicate = await findMetaByHash(shortHash);
  if (duplicate) {
    return json({ ok: true, skipped: true, path: duplicate.path });
  }

  const originalName = sanitizeFilename(file.name || 'upload.xlsx');
  const encPayload = await encryptBuffer(buffer, ENCRYPTION_KEY);

  // تلاش برای استخراج خلاصه ردیف‌ها از نام/حجم — خلاصه واقعی در کلاینت با designer_data
  // برای designer_data: چون ورکر XLSX ندارد، summary را از کلاینت بپذیر
  let rowsSummary = [];
  const rowsJson = form.get('rowsJson');
  if (rowsJson && typeof rowsJson === 'string') {
    try {
      rowsSummary = JSON.parse(rowsJson).slice(0, 5000);
    } catch {}
  }

  const meta = {
    salesHash: shortHash,
    designer,
    season,
    originalName,
    uploadedAt: new Date().toISOString(),
    size: buffer.byteLength,
    rows: rowsSummary,
  };

  const encPath = `data/${shortHash}.enc`;
  const metaPath = `data/${shortHash}.meta.json`;

  await putFile(encPath, arrayBufferToBase64(encPayload), `enc: ${originalName}`);
  await putFile(
    metaPath,
    arrayBufferToBase64(new TextEncoder().encode(JSON.stringify(meta, null, 2))),
    `meta: ${designer} / ${season}`
  );

  return json({ ok: true, skipped: false, path: encPath, meta });
}

// ——— Google Drive ———
function extractFolderId(url) {
  const m = String(url).match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function driveList({ folderUrl }) {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) return json({ error: 'لینک پوشه درایو نامعتبر است' }, 400);
  if (!GOOGLE_API_KEY) {
    return json({
      error: 'GOOGLE_API_KEY در Worker تنظیم نشده. یک API Key از Google Cloud Console بسازید و Drive API را فعال کنید.',
      files: [],
    }, 400);
  }

  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent('files(id,name,mimeType,size)');
  const apiUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&key=${GOOGLE_API_KEY}`;
  const res = await fetch(apiUrl);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: data.error?.message || 'خطای Drive API', files: [] }, 400);
  }

  const allowed = /\.(xlsx|xls|csv|pdf)$/i;
  const files = (data.files || [])
    .filter((f) => allowed.test(f.name) || (f.mimeType || '').includes('spreadsheet') || (f.mimeType || '').includes('pdf'))
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({ ok: true, files });
}

async function driveImport({ fileId, fileName, designer, mimeType }) {
  if (!fileId || !designer) return json({ error: 'fileId و designer لازم است' }, 400);

  // دانلود فایل عمومی
  let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  if (GOOGLE_API_KEY) downloadUrl += `&key=${GOOGLE_API_KEY}`;

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    // fallback: لینک uc
    const uc = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
    if (!uc.ok) return json({ error: 'دانلود فایل از درایو ناموفق' }, 400);
    const buffer = await uc.arrayBuffer();
    return processDownloadedFile(buffer, fileName || 'drive-file', designer);
  }
  const buffer = await res.arrayBuffer();
  return processDownloadedFile(buffer, fileName || 'drive-file', designer);
}

async function processDownloadedFile(buffer, fileName, designer) {
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const salesHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const shortHash = salesHash.slice(0, 16);

  const duplicate = await findMetaByHash(shortHash);
  if (duplicate) {
    return json({ ok: true, skipped: true, path: duplicate.path });
  }

  // استخراج فصل از نام فایل
  let season = 'نامشخص';
  const base = String(fileName)
    .replace(/\.xlsx\.xls$/i, '')
    .replace(/\.(xlsx|xls|csv|pdf)$/i, '');
  const parts = base.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) season = parts.slice(1).join(' - ');

  const originalName = sanitizeFilename(fileName);
  const encPayload = await encryptBuffer(buffer, ENCRYPTION_KEY);
  const meta = {
    salesHash: shortHash,
    designer: sanitizeFilename(designer),
    season: sanitizeFilename(season),
    originalName,
    uploadedAt: new Date().toISOString(),
    size: buffer.byteLength,
    rows: [],
    source: 'google-drive',
  };

  await putFile(`data/${shortHash}.enc`, arrayBufferToBase64(encPayload), `enc drive: ${originalName}`);
  await putFile(
    `data/${shortHash}.meta.json`,
    arrayBufferToBase64(new TextEncoder().encode(JSON.stringify(meta, null, 2))),
    `meta drive: ${designer} / ${season}`
  );
  return json({ ok: true, skipped: false, meta });
}

// ——— GitHub helpers ———
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'giktori-upload-worker',
  };
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'unknown';
}

function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(secret) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('giktori-sticker-v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBuffer(buffer, secret) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return out;
}

async function decryptBuffer(payload, secret) {
  const key = await deriveKey(secret);
  const iv = payload.slice(0, 12);
  const data = payload.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new Uint8Array(plain);
}

async function githubGet(path) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
    { headers: githubHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

async function putFile(path, base64Content, message, sha) {
  const existing = sha ? { sha } : await githubGet(path);
  const body = {
    message,
    content: base64Content,
    branch: GITHUB_BRANCH,
  };
  if (existing && existing.sha) body.sha = existing.sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: githubHeaders(),
      body: JSON.stringify(body),
    }
  );
  const putData = await putRes.json().catch(() => ({}));
  if (!putRes.ok) {
    throw new Error(putData.message || putRes.statusText || 'خطای گیت‌هاب');
  }
  return putData;
}

async function findMetaByHash(shortHash) {
  const meta = await githubGet(`data/${shortHash}.meta.json`);
  if (!meta) return null;
  return { path: meta.path, sha: meta.sha };
}

async function listDataDir() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data?ref=${GITHUB_BRANCH}`,
    { headers: githubHeaders() }
  );
  if (res.status === 404) return [];
  if (!res.ok) return [];
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

async function getFileContentBase64(path) {
  const data = await githubGet(path);
  if (!data || !data.content) throw new Error('خواندن فایل: ' + path);
  return data.content.replace(/\n/g, '');
}
