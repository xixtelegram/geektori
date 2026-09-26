/** صفحه اول: ورود / ثبت‌نام / بازیابی */

import { WORKER_URL } from '../config.js';
import { hashPassword, generateRecoveryCodes, saveSession, loadSession } from '../shared/auth.js';

const session = loadSession();
if (session?.username) {
  location.href = 'designer.html';
}

// تب‌ها
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('bg-white', 'shadow-sm', 'font-semibold');
      b.classList.add('text-slate-600', 'font-medium');
    });
    btn.classList.add('bg-white', 'shadow-sm', 'font-semibold');
    btn.classList.remove('text-slate-600', 'font-medium');
    document.getElementById('formLogin').classList.toggle('hidden', tab !== 'login');
    document.getElementById('formRegister').classList.toggle('hidden', tab !== 'register');
    document.getElementById('formRecover').classList.toggle('hidden', tab !== 'recover');
  });
});

async function api(action, body) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || res.statusText || 'خطای سرور');
  return data;
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ورود
document.getElementById('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('loginErr').classList.add('hidden');
  const username = document.getElementById('loginName').value.trim();
  const password = document.getElementById('loginPass').value;
  try {
    const passwordHash = await hashPassword(password, username.toLowerCase());
    const data = await api('login', { username, passwordHash });
    saveSession({ username: data.username, displayName: data.displayName || data.username });
    location.href = 'designer.html';
  } catch (err) {
    showErr('loginErr', err.message || String(err));
  }
});

// ثبت‌نام
document.getElementById('formRegister').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('regErr').classList.add('hidden');
  const username = document.getElementById('regName').value.trim();
  const pass = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;
  if (pass !== pass2) {
    showErr('regErr', 'رمز و تکرار آن یکسان نیست.');
    return;
  }
  if (pass.length < 6) {
    showErr('regErr', 'رمز حداقل ۶ کاراکتر باشد.');
    return;
  }
  try {
    const passwordHash = await hashPassword(pass, username.toLowerCase());
    const recoveryPlain = generateRecoveryCodes(4);
    const recoveryHashes = [];
    for (const code of recoveryPlain) {
      recoveryHashes.push(await hashPassword(code.replace(/-/g, ''), username.toLowerCase() + '-rec'));
    }
    const data = await api('register', {
      username,
      passwordHash,
      recoveryHashes,
      displayName: username,
    });
    saveSession({ username: data.username, displayName: data.displayName || data.username });
    const list = document.getElementById('recoveryList');
    list.innerHTML = recoveryPlain
      .map((c) => `<li class="bg-black/5 rounded-xl py-2 tracking-widest">${c}</li>`)
      .join('');
    document.getElementById('recoveryBox').classList.remove('hidden');
    document.querySelector('.glass-strong').classList.add('hidden');
  } catch (err) {
    showErr('regErr', err.message || String(err));
  }
});

document.getElementById('goToPanel').onclick = () => {
  location.href = 'designer.html';
};

// بازیابی
document.getElementById('formRecover').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('recErr').classList.add('hidden');
  const username = document.getElementById('recName').value.trim();
  const code = document.getElementById('recCode').value.trim().toUpperCase();
  const newPass = document.getElementById('recNewPass').value;
  if (newPass.length < 6) {
    showErr('recErr', 'رمز جدید حداقل ۶ کاراکتر باشد.');
    return;
  }
  try {
    const codeHash = await hashPassword(code.replace(/-/g, ''), username.toLowerCase() + '-rec');
    const passwordHash = await hashPassword(newPass, username.toLowerCase());
    await api('recover', { username, codeHash, passwordHash });
    saveSession({ username, displayName: username });
    location.href = 'designer.html';
  } catch (err) {
    showErr('recErr', err.message || String(err));
  }
});
