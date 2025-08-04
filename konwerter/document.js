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

/* ---------- STRICT-MODE Mini PDF (Acrobat-safe) ------------------ */
/*  – one A4 page, Helvetica 12 pt                                    */
/*  – returns Uint8Array (pass it straight to Blob)                   */
function generateMiniPDF(text = '') {

  /* helpers ------------------------------------------------------- */
  const ascii  = s => Uint8Array.from([...s].map(c => c.charCodeAt(0) & 0xFF));
  const parts  = [];           // Uint8Array[]
  const offs   = [0];          // x-ref offsets, entry 0 is free list
  let   pos    = 0;            // running byte position
  const push   = u8 => (parts.push(u8), pos += u8.length);
  const pushS  = s  => push(ascii(s));

  /* HEADER -------------------------------------------------------- */
  pushS('%PDF-1.4\n');                              // spec §7.5.2
  push(Uint8Array.of(                               // binary comment, SINGLE-byte 0xE2 0xE3 0xCF 0xD3
      0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A));         // %âãÏÓ\n

  /* PAGE CONTENT -------------------------------------------------- */
  const esc = s => s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const body = ['BT','/F1 12 Tf'];
  let y = 820;
  for (const line of text.split(/\r?\n/)) {
    if (y < 50) break;
    body.push(`1 0 0 1 50 ${y} Tm (${esc(line)}) Tj`);
    y -= 14;
  }
  body.push('ET');
  const streamBytes = ascii(body.join('\n'));
  const streamLen   = streamBytes.length;

  /* OBJECTS 1…4 --------------------------------------------------- */
  const obj = s => { offs.push(pos); pushS(s); };
  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  obj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n' +
     '   /Resources << /Font << /F1 4 0 R >> >>\n   /Contents 5 0 R >>\nendobj\n');
  obj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  /* OBJECT 5 – CONTENT STREAM ------------------------------------ */
  offs.push(pos);
  pushS(`5 0 obj\n<< /Length ${streamLen} >>\nstream\n`);
  push(streamBytes);                                               // **raw bytes – do NOT re-encode**
  pushS('\nendstream\nendobj\n');

  /* X-REF --------------------------------------------------------- */
  const xrefPos = pos;
  pushS(`xref\n0 ${offs.length}\n`);
  pushS('0000000000 65535 f \n');                                 // free entry (20 bytes: SP LF terminator)

  for (let i = 1; i < offs.length; i++) {
    pushS(`${String(offs[i]).padStart(10,'0')} 00000 n \n`);      // 10 digits + “ 00000 n ␠LF” = 20 bytes
  }

  /* TRAILER & EOF ------------------------------------------------- */
  pushS(`trailer\n<< /Size ${offs.length} /Root 1 0 R >>\n` +
        `startxref\n${xrefPos}\n%%EOF\n`);                        // newline *after* %%EOF

  /* CONCAT -------------------------------------------------------- */
  const out = new Uint8Array(pos);
  let p = 0; for (const u of parts) { out.set(u, p); p += u.length; }
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
