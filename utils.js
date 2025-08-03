// utils.js
export function truncate(str, n) {
  if (typeof str !== 'string') return '';
  if (str.length <= n) return str;
  const ext = str.includes('.') ? '.' + str.split('.').pop() : '';
  const base = str.slice(0, Math.max(0, n - ext.length - 1));
  return base + '…' + ext;
}

export function humanSize(bytes) {
  const GBb = 1024 * 1024 * 1024;
  const MBb = 1024 * 1024;
  const KBb = 1024;
  if (bytes >= GBb) return (bytes / GBb).toFixed(2) + ' GB';
  if (bytes >= MBb) return (bytes / MBb).toFixed(1) + ' MB';
  if (bytes >= KBb) return (bytes / KBb).toFixed(1) + ' KB';
  return bytes + ' B';
}

export function commonPrefix(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  let p = arr[0];
  for (let i = 1; i < arr.length; i++) {
    let j = 0;
    const s = arr[i];
    while (j < p.length && j < s.length && p[j] === s[j]) j++;
    p = p.slice(0, j);
    if (!p) break;
  }
  return p.replace(/[-_. ]+$/, '');
}

export function escapeHTML(s) {
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function escapeRTF(s) {
  return s.replace(/[\\{}]/g, m => '\\' + m).replace(/\n/g, '\\par ');
}
