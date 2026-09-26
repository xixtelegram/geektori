/** هش رمز عبور و مدیریت نشست طراح (سمت کلاینت) */

const SESSION_KEY = 'giktori_designer_session';

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt || 'giktori-user-v1'),
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateRecoveryCodes(count = 4) {
  const codes = [];
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let code = '';
    for (const b of bytes) code += alphabet[b % alphabet.length];
    codes.push(code.slice(0, 4) + '-' + code.slice(4, 8));
  }
  return codes;
}

/** localStorage تا با بستن تب نشست نپرد */
export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || 'null';
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}
