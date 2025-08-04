/* ---------------------------------------------------------------
   converter-final.js  –  zero external imports
   TXT ⇆ PDF (raw / rendered) + MD / HTML / RTF
   ------------------------------------------------------------- */

/* ---------- tiny helpers ------------------------------------- */
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

/* ---------- raw binary → latin-1 text ------------------------ */
async function readRaw(file) {
  const buf = await file.arrayBuffer();              // Uint8Array
  return new TextDecoder('latin1').decode(buf);      // 1-to-1 bytes
}

/* ---------- ASCII-only encoder --------------------------------*/
const ascii = s =>
  Uint8Array.from([...s].map(ch => {
    const c = ch.charCodeAt(0);
    return (c === 0x0A || (c >= 0x20 && c <= 0x7E)) ? c : 0x3F; // “?” fallback
  }));

/* ---------- minimal 1-page PDF generator --------------------- */
function generateMiniPDF(text = '') {
  const parts = [];           // Uint8Array[]
  const offs  = [0];          // x-ref offsets (entry 0 = free list)
  let   pos   = 0;
  const push  = u8 => { parts.push(u8); pos += u8.length; };
  const pushS = s  => push(ascii(s));

  /* header */
  pushS('%PDF-1.4\n');
  push(Uint8Array.of(0x25,0xE2,0xE3,0xCF,0xD3,0x0A)); // %âãÏÓ\n

  /* page stream */
  const esc = s => s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const body = ['BT','/F1 12 Tf'];
  let y = 820;
  for (const ln of text.split(/\r?\n/)) {
    if (y < 50) break;
    body.push(`1 0 0 1 50 ${y} Tm (${esc(ln)}) Tj`);
    y -= 14;
  }
  body.push('ET');
  const streamBytes = ascii(body.join('\n'));
  const streamLen   = streamBytes.length;

  /* objects 1-4 */
  const obj = s => { offs.push(pos); pushS(s); };
  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  obj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n' +
     '   /Resources << /Font << /F1 4 0 R >> >>\n   /Contents 5 0 R >>\nendobj\n');
  obj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  /* object 5 – stream */
  offs.push(pos);
  pushS(`5 0 obj\n<< /Length ${streamLen} >>\nstream\n`);
  push(streamBytes);
  pushS('\nendstream\nendobj\n');

  /* xref */
  const xrefPos = pos;
  pushS(`xref\n0 ${offs.length}\n`);
  pushS('0000000000 65535 f \n');
  offs.slice(1).forEach(o =>
    pushS(`${String(o).padStart(10,'0')} 00000 n \n`));

  /* trailer & EOF */
  pushS(`trailer\n<< /Size ${offs.length} /Root 1 0 R >>\n` +
        `startxref\n${xrefPos}\n%%EOF\n`);

  /* concatenate */
  const out = new Uint8Array(pos);
  let p = 0; for (const u of parts) { out.set(u, p); p += u.length; }
  return out;
}

/* ---------- Blob / Uint8 helpers ------------------------------ */
const toBlob  = (chunks, type) => new Blob(chunks, { type });
const toUint8 = d =>
      d instanceof Uint8Array ? d
    : d instanceof ArrayBuffer ? new Uint8Array(d)
    : typeof d === 'string'    ? new TextEncoder().encode(d)
    : (() => { throw TypeError() })();

/* ---------- core converter → Blob ----------------------------- */
export async function convertDocument(file, fmt = 'txt') {
  const f   = String(fmt).toLowerCase();
  const txt = await tryReadText(file);           // original as UTF-8 text

  switch (f) {

    case 'txt':
      return toBlob([txt], 'text/plain;charset=utf-8');

    case 'md':
      return toBlob([`# Przekonwertowany dokument

Oryginał: ${file.name}

---

${txt}`], 'text/markdown;charset=utf-8');

    case 'html-lite': {
      const safe = escapeHTML(txt).slice(0, 20_000);
      return toBlob([`<!doctype html><meta charset="utf-8">
<title>${escapeHTML(file.name)}</title>
<style>
body{font-family:system-ui;margin:20px;line-height:1.5;white-space:pre-wrap}
h1{margin-top:0}
</style>
<h1>${escapeHTML(file.name)}</h1>
<div>${safe}</div>`], 'text/html;charset=utf-8');
    }

    case 'pdf-lite': {
      const pdf = toUint8(generateMiniPDF(txt.slice(0, 20_000)));
      return toBlob([pdf], 'application/pdf');
    }

    case 'rtf-lite':
      return toBlob([`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20
Przekonwertowano z ${escapeRTF(file.name)}\\par
${escapeRTF(txt.slice(0, 5000))}}`], 'application/rtf');

    /* -------- RAW dump (binary → latin-1 TXT) ------------------ */
    case 'pdf-raw':
    case 'raw': {
      const raw = await readRaw(file);
      return toBlob([raw], 'text/plain;charset=latin1');
    }

    default:
      return toBlob([txt], 'text/plain;charset=utf-8');
  }
}

/* ---------- convenience wrapper → *File* ----------------------- */
/* Produces a File with the correct MIME *and* extension so the   */
/* browser download prompt offers e.g. “dokument.pdf”.             */
export async function convertAndRename(file, fmt = 'txt') {
  const blob = await convertDocument(file, fmt);

  /* decide on output extension --------------------------------- */
  const ext = (() => {
    const t = fmt.toLowerCase();
    if (t.startsWith('pdf')) return 'pdf';
    if (t === 'md')          return 'md';
    if (t === 'html-lite')   return 'html';
    if (t === 'rtf-lite')    return 'rtf';
    return 'txt';
  })();

  const base = file.name.replace(/\.[^.]+$/, '');      // drop old ext
  const newName = `${base}.${ext}`;
  return new File([blob], newName, { type: blob.type });
}
