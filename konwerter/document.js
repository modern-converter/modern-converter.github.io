/* converter-fixed.js
 * ZERO importów – wszystkie helpery w środku.
 * Poprawione liczenie xref ⇒ PDF otwiera się w Edge, Chrome, Adobe.
 */

/* ------------------------------------------------------------------ */
/* 1.  Escapy i odczyt pliku                                          */
/* ------------------------------------------------------------------ */

const escapeHTML = (s = '') =>
  s.replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])
  );

const escapeRTF = (s = '') =>
  s.replace(/[\\{}]/g, '\\$&').replace(/\n/g, '\\par ');

async function tryReadText(file, encoding = 'utf-8') {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload  = () => res(fr.result);
    fr.readAsText(file, encoding);
  });
}

/* ------------------------------------------------------------------ */
/* 2.  Minimalny PDF z poprawnym xref                                 */
/* ------------------------------------------------------------------ */
function generateMiniPDF(text = '') {
  const enc     = new TextEncoder();               // UTF-8 → Uint8Array
  const chunks  = [];                              // gotowe kawałki
  const offsets = [0];                             // offset[0] = 0
  let   offset  = 0;                               // licznik bajtów

  /* pomocnik dodający fragment i zapamiętujący długość */
  const push = (str) => {
    const bytes = enc.encode(str);
    chunks.push(bytes);
    offset += bytes.length;
    return bytes.length;
  };

  /* --- nagłówki ---------------------------------------------------- */
  push('%PDF-1.4\n%âãÏÓ\n');                      // 2 linie – spec wymaga >127

  /* --- treść strumienia ------------------------------------------- */
  const lines = text.split(/\r?\n/);
  let y = 820;
  const body = ['BT', '/F1 12 Tf'];
  for (const raw of lines) {
    if (y < 50) break;
    const safe = raw.replace(/[()\\]/g, '\\$&');
    body.push(`1 0 0 1 50 ${y} Tm (${safe}) Tj`);
    y -= 14;
  }
  body.push('ET');
  const stream = body.join('\n');
  const streamLen = stream.length;

  /* --- zdefiniuj obiekty ------------------------------------------ */
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n` +
    `   /Resources << /Font << /F1 4 0 R >> >>\n` +
    `   /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  /* --- wrzuć obiekty, zapisując offset każdego -------------------- */
  for (const obj of objects) {
    offsets.push(offset);
    push(obj);
  }

  /* --- xref -------------------------------------------------------- */
  const xrefStart = offset;
  push(`xref\n0 ${objects.length + 1}\n`);
  push('0000000000 65535 f \n');
  for (let i = 1; i <= objects.length; i++) {
    push(offsets[i].toString().padStart(10, '0') + ' 00000 n \n');
  }

  /* --- trailer + EOF ---------------------------------------------- */
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`);
  push(`startxref\n${xrefStart}\n%%EOF`);

  /* --- scal wszystkie kawałki w jeden Uint8Array ------------------ */
  const out = new Uint8Array(offset);
  let pos = 0;
  for (const part of chunks) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3.  Helpery Blob + Uint8                                           */
/* ------------------------------------------------------------------ */
const toBlob = (parts, type) => new Blob(parts, { type });

const ensureUint8 = (data) => {
  if (data instanceof Uint8Array)  return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string')    return new TextEncoder().encode(data);
  throw new TypeError('Unsupported binary type');
};

/* ------------------------------------------------------------------ */
/* 4.  główna funkcja eksportowana                                    */
/* ------------------------------------------------------------------ */
export async function convertDocument(file, fmt = 'txt') {
  const format = String(fmt).toLowerCase();
  const text   = await tryReadText(file);

  switch (format) {
    case 'txt':
      return toBlob([text], 'text/plain;charset=utf-8');

    case 'md': {
      const md =
`# Przekonwertowany dokument

Oryginał: ${file.name}

---

${text}`;
      return toBlob([md], 'text/markdown;charset=utf-8');
    }

    case 'html-lite': {
      const safe = escapeHTML(text).slice(0, 20_000);
      const html =
`<!doctype html><meta charset="utf-8">
<title>${escapeHTML(file.name)}</title>
<style>
  body{font-family:system-ui;margin:20px;line-height:1.5;white-space:pre-wrap}
  h1{margin-top:0}
</style>
<h1>${escapeHTML(file.name)}</h1>
<div>${safe}</div>`;
      return toBlob([html], 'text/html;charset=utf-8');
    }

    case 'pdf-lite': {
      const bytes = ensureUint8(generateMiniPDF(text.slice(0, 20_000)));
      return toBlob([bytes], 'application/pdf');
    }

    case 'rtf-lite': {
      const rtf =
`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20
Przekonwertowano z ${escapeRTF(file.name)}\\par
${escapeRTF(text.slice(0, 5000))}}`;
      return toBlob([rtf], 'application/rtf');
    }

    default:
      return toBlob([text], 'text/plain;charset=utf-8');
  }
}
