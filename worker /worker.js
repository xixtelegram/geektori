/**
 * Cloudflare Worker — آپلود امن فایل اکسل به ریپوی گیت‌هاب
 *
 * Secrets (در Cloudflare Dashboard → Worker → Settings → Variables):
 *   GITHUB_TOKEN   = Personal Access Token با scope: repo (یا contents:write)
 *   GITHUB_OWNER   = نام کاربری/سازمان گیت‌هاب (مثلاً myorg)
 *   GITHUB_REPO    = نام ریپو (مثلاً giktori-sticker-dashboard)
 *   GITHUB_BRANCH  = (اختیاری) شاخه، پیش‌فرض main
 *
 * Deploy:
 *   1. حساب Cloudflare بساز (رایگان)
 *   2. Workers & Pages → Create Worker
 *   3. کد این فایل را جایگزین کن و Deploy بزن
 *   4. Secrets را اضافه کن
 *   5. آدرس Worker را در index.html در ثابت WORKER_URL بگذار
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'فقط POST مجاز است' }, 405);
    }

    const token = env.GITHUB_TOKEN;
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
      return json({ error: 'Secrets ناقص است (GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO)' }, 500);
    }

    try {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return json({ error: 'فایل ارسال نشده' }, 400);
      }

      const originalName = sanitizeFilename(file.name || 'upload.xlsx');
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '_',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');
      const path = `data/${stamp}_${originalName}`;

      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      // اگر فایل از قبل وجود داشت، sha لازم است — برای نام timestamp-شده معمولاً لازم نیست
      const existing = await githubGet(owner, repo, path, branch, token);
      const body = {
        message: `upload: ${originalName}`,
        content: base64,
        branch,
      };
      if (existing && existing.sha) body.sha = existing.sha;

      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': 'giktori-upload-worker',
          },
          body: JSON.stringify(body),
        }
      );

      const putData = await putRes.json().catch(() => ({}));
      if (!putRes.ok) {
        const msg = putData.message || putRes.statusText || 'خطای گیت‌هاب';
        return json({ error: `گیت‌هاب: ${msg}`, details: putData }, putRes.status >= 500 ? 502 : 400);
      }

      return json({
        ok: true,
        path,
        html_url: putData.content?.html_url || null,
        commit: putData.commit?.sha || null,
      });
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

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'upload.xlsx';
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function githubGet(owner, repo, path, branch, token) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'giktori-upload-worker',
      },
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}
