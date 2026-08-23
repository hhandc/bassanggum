const STORAGE_KEY = 'bassanggum-device-token';

function generateToken(): string {
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && 'randomValues' in crypto) {
    crypto.getRandomValues(array);
  } else {
    for (let index = 0; index < array.length; index += 1) {
      array[index] = Math.floor(Math.random() * 256);
    }
  }
  return [...array].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getDeviceToken(): string {
  if (typeof localStorage === 'undefined') return `anon-${generateToken()}`;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored;
  const token = `anon-${generateToken()}`;
  localStorage.setItem(STORAGE_KEY, token);
  return token;
}
