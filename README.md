# داشبورد فروش استیکر — گیکتوری

## ساختار ماژولار

```
.
├── index.html                 ← داشبورد طراح (HTML نازک)
├── admin.html                 ← پنل ادمین (HTML نازک)
├── assets/
│   ├── css/
│   │   └── app.css            ← استایل مشترک
│   └── js/
│       ├── config.js          ← WORKER_URL و تنظیمات گیت‌هاب
│       ├── shared/
│       │   ├── format.js      ← فرمت عدد/پول و escape
│       │   ├── dom.js         ← loading / toast / error
│       │   ├── crypto.js      ← AES-GCM رمزگشایی
│       │   └── excel.js       ← پارس اکسل
│       ├── dashboard/
│       │   ├── main.js        ← نقطه ورود داشبورد
│       │   ├── state.js
│       │   ├── filters.js
│       │   ├── render.js
│       │   └── upload.js      ← آپلود به Worker
│       └── admin/
│           └── main.js        ← نقطه ورود پنل ادمین
├── worker/
│   └── worker.js              ← Cloudflare Worker
└── data/                      ← فایل‌های .enc و .meta.json
```

## آدرس‌ها

- داشبورد: `https://xixtelegram.github.io/geektori/`
- پنل ادمین: `https://xixtelegram.github.io/geektori/admin.html` (لینک در داشبورد نیست)

## تنظیمات

در `assets/js/config.js`:

```js
export const WORKER_URL = 'https://....workers.dev';
export const GITHUB = { owner: 'xixtelegram', repo: 'geektori', branch: 'main' };
```

در `worker/worker.js`: توکن، ریپو و `ENCRYPTION_KEY`.

## توسعه محلی

```bash
npx serve .
```

ماژول‌های ES نیاز به HTTP دارند (`file://` کار نمی‌کند).
