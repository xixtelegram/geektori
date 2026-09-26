/** صفحه اول: ورود / ثبت‌نام / بازیابی */

import { WORKER_URL } from '../config.js';
import { hashPassword, generateRecoveryCodes, saveSession, loadSession } from '../shared/auth.js';

const session = loadSession();
if (session?.username) {
  location.replace('designer.html');
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function setBusy(form, busy) {
  const btn = form?.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = !!busy;
  btn.style.opacity = busy ? '0.7' : '';
}

async function api(action, body) {
  if (!WORKER_URL) throw new Error('آدرس ورکر تنظیم نشده است');
  let res;
  try {
    res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new Error('اتصال به سرور برقرار نشد. اینترنت یا آدرس ورکر را بررسی کنید.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || res.statusText || 'خطای سرور');
  }
  return data;
}

// ——— ورود ———
document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr('loginErr', '');
  const form = e.target;
  const username = document.getElementById('loginName').value.trim();
  const password = document.getElementById('loginPass').value;
  if (!username || !password) {
    showErr('loginErr', 'نام کاربری و رمز را وارد کنید.');
    return;
  }
  setBusy(form, true);
  try {
    const passwordHash = await hashPassword(password, username.toLowerCase());
    const data = await api('login', { username, passwordHash });
    saveSession({
      username: data.username,
      displayName: data.displayName || data.username,
    });
    location.href = 'designer.html';
  } catch (err) {
    showErr('loginErr', err.message || String(err));
  } finally {
    setBusy(form, false);
  }
});

// ——— ثبت‌نام ———
document.getElementById('formRegister')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr('regErr', '');
  const form = e.target;
  const username = document.getElementById('regName').value.trim();
  const pass = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;

  if (!username) {
    showErr('regErr', 'نام طراح را وارد کنید.');
    return;
  }
  if (pass.length < 6) {
    showErr('regErr', 'رمز حداقل ۶ کاراکتر باشد.');
    return;
  }
  if (pass !== pass2) {
    showErr('regErr', 'رمز و تکرار آن یکسان نیست.');
    return;
  }

  setBusy(form, true);
  try {
    const passwordHash = await hashPassword(pass, username.toLowerCase());
    const recoveryPlain = generateRecoveryCodes(4);
    const recoveryHashes = [];
    for (const code of recoveryPlain) {
      recoveryHashes.push(
        await hashPassword(code.replace(/-/g, ''), username.toLowerCase() + '-rec')
      );
    }
    const data = await api('register', {
      username,
      passwordHash,
      recoveryHashes,
      displayName: username,
    });
    saveSession({
      username: data.username,
      displayName: data.displayName || data.username,
    });

    const list = document.getElementById('recoveryList');
    if (list) {
      list.innerHTML = recoveryPlain
        .map((c) => `<li class="bg-black/5 rounded-xl py-2 tracking-widest">${c}</li>`)
        .join('');
    }
    // فقط کارت ورود را مخفی کن (نه باکس کدها)
    document.getElementById('authCard')?.classList.add('hidden');
    document.getElementById('recoveryBox')?.classList.remove('hidden');
  } catch (err) {
    showErr('regErr', err.message || String(err));
  } finally {
    setBusy(form, false);
  }
});

document.getElementById('goToPanel')?.addEventListener('click', () => {
  location.href = 'designer.html';
});

// ——— بازیابی ———
document.getElementById('formRecover')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr('recErr', '');
  const form = e.target;
  const username = document.getElementById('recName').value.trim();
  const codeRaw = document.getElementById('recCode').value.trim().toUpperCase();
  const newPass = document.getElementById('recNewPass').value;

  if (!username || !codeRaw) {
    showErr('recErr', 'نام کاربری و کد بازیابی را وارد کنید.');
    return;
  }
  if (newPass.length < 6) {
    showErr('recErr', 'رمز جدید حداقل ۶ کاراکتر باشد.');
    return;
  }

  setBusy(form, true);
  try {
    const codeHash = await hashPassword(
      codeRaw.replace(/-/g, ''),
      username.toLowerCase() + '-rec'
    );
    const passwordHash = await hashPassword(newPass, username.toLowerCase());
    const data = await api('recover', { username, codeHash, passwordHash });
    saveSession({
      username: data.username || username,
      displayName: data.displayName || username,
    });
    location.href = 'designer.html';
  } catch (err) {
    showErr('recErr', err.message || String(err));
  } finally {
    setBusy(form, false);
  }
});
