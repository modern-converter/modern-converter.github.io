/* converter-final.js  –  zero importów, wszystko w środku */
const escapeHTML = (s = '') =>
  s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const escapeRTF = (s = '') =>
  s.replace(/[\\{}]/g, '\\$&').replace(/\n/g, '\\par ');

async function tryReadText(file, enc = 'utf-8') {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((ok, bad) => {
    const fr = new FileReader();
    fr.onerror = () => bad(fr.error);
    fr.onload  = () => ok(fr.result);
    fr.readAsText(file, enc);
  });
}

/* ---------- POPRAWIONE generateMiniPDF() ------------------------------ */
function generateMiniPDF(text = '') {
  const enc   = new TextEncoder();
  const parts = [];                 // Uint8Array[]
  const offs  = [0];
  let   pos   = 0;

  const add = (u8) => { parts.push(u8); pos += u8.length; return u8.length; };
  const addStr = (s) => add(enc.encode(s));

  /* nagłówek */
  addStr('%PDF-1.4\n%âãÏÓ\n');

  /* przygotuj strumień tekstu */
  const body = ['BT','/F1 12 Tf'];
  let y = 820;
  for (const raw of text.split(/\r?\n/)) {
    if (y < 50) break;
    body.push(`1 0 0 1 50 ${y} Tm (${raw.replace(/[()\\]/g,'\\$&')}) Tj`);
    y -= 14;
  }
  body.push('ET');
  const stream     = body.join('\n');
  const streamU8   = enc.encode(stream);
  const streamLen  = streamU8.length;

  /* obiekty */
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n' +
    '   /Resources << /Font << /F1 4 0 R >> >>\n   /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ];

  /* wrzuć obiekty 1-4 */
  for (const o of objs) { offs.push(pos); addStr(o); }

  /* obiekt 5 (strumień) – liczba bajtów = streamLen */
  offs.push(pos);
  addStr(`5 0 obj\n<< /Length ${streamLen} >>\nstream\n`);
  add(streamU8);                 // SUROWYCH bajtów, nie ponowne encodowanie
  addStr('\nendstream\nendobj\n');

  /* xref */
  const xref = pos;
  addStr(`xref\n0 ${offs.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offs.length; i++)
    addStr(offs[i].toString().padStart(10,'0') + ' 00000 n \n');

  /* trailer + EOF */
  addStr(`trailer\n<< /Size ${offs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  /* scal całość */
  const out = new Uint8Array(pos);
  let p = 0;
  for (const u of parts) { out.set(u, p); p += u.length; }
  return out;
}

/* ---------- wspólne helpery ------------------------------------------- */
const toBlob   = (chunks, type) => new Blob(chunks, { type });
const toUint8  = (d) => d instanceof Uint8Array ? d
                   : d instanceof ArrayBuffer  ? new Uint8Array(d)
                   : typeof d === 'string'     ? new TextEncoder().encode(d)
                   : (()=>{throw TypeError()})();

/* ---------- GŁÓWNA FUNKCJA -------------------------------------------- */
export async function convertDocument(file, fmt = 'txt') {
  const f   = String(fmt).toLowerCase();
  const txt = await tryReadText(file);

  switch (f) {
    case 'txt':  return toBlob([txt], 'text/plain;charset=utf-8');

    case 'md':   return toBlob([
`# Przekonwertowany dokument

Oryginał: ${file.name}

---

${txt}`], 'text/markdown;charset=utf-8');

    case 'html-lite': {
      const safe = escapeHTML(txt).slice(0, 20_000);
      return toBlob([
`<!doctype html><meta charset="utf-8">
<title>${escapeHTML(file.name)}</title>
<style>
body{font-family:system-ui;margin:20px;line-height:1.5;white-space:pre-wrap}
h1{margin-top:0}
</style>
<h1>${escapeHTML(file.name)}</h1>
<div>${safe}</div>`], 'text/html;charset=utf-8'); }

    case 'pdf':
    case 'pdf-lite': {
      const pdf = toUint8(generateMiniPDF(txt.slice(0, 20_000)));
      return toBlob([pdf], 'application/pdf'); }

    case 'rtf-lite':
      return toBlob([`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20
Przekonwertowano z ${escapeRTF(file.name)}\\par
${escapeRTF(txt.slice(0, 5000))}}`], 'application/rtf');

    default:
      return toBlob([txt], 'text/plain;charset=utf-8');
  }
}
