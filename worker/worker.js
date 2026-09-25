/**
 * Cloudflare Worker — آپلود رمزشده به گیت‌هاب
 *
 * GITHUB_TOKEN / OWNER / REPO / BRANCH و ENCRYPTION_KEY را پایین پر کن.
 * همان ENCRYPTION_KEY باید در admin.html هم باشد.
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
// کلید رمزنگاری مشترک با پنل ادمین (یک رشته بلند و تصادفی بگذار)
const ENCRYPTION_KEY = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET';

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

    try {
      const form = await request.formData();
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
      const meta = {
        salesHash: shortHash,
        designer,
        season,
        originalName,
        uploadedAt: new Date().toISOString(),
        size: buffer.byteLength,
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
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
  },
};

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

/** خروجی: iv(12) + ciphertext */
async function encryptBuffer(buffer, secret) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    buffer
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return out;
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

async function putFile(path, base64Content, message) {
  const existing = await githubGet(path);
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
