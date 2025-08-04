/* converter-single.js
 * Jeden plik = zero importów.  Obsługuje:
 *   txt  → .txt
 *   md   → .md
 *   html-lite → .html
 *   pdf-lite  → .pdf
 *   rtf-lite  → .rtf
 *
 * Użycie (w przeglądarce lub Node 18+):
 *   const blob = await convertDocument(file, 'pdf-lite');
 *   // dalej jak zwykle z Blob-em…
 */

/* ---------------------------------------------------------------------- */
/* 1.  Helpery codujące tekst / odczytujące pliki                         */
/* ---------------------------------------------------------------------- */

/* Escapowanie znaków w HTML */
const escapeHTML = (s = '') =>
  s.replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])
  );

/* Escapowanie znaków w RTF */
const escapeRTF = (s = '') =>
  s.replace(/[\\{}]/g, '\\$&').replace(/\n/g, '\\par ');

/* Odczyt pliku jako UTF-8 (Blob/File) */
async function tryReadText(file, encoding = 'utf-8') {
  if (typeof file?.text === 'function') return file.text(); // nowoczesne API

  // Fallback dla bardzo starych środowisk
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload  = () => res(fr.result);
    fr.readAsText(file, encoding);
  });
}

/* ---------------------------------------------------------------------- */
/* 2.  Minimalistyczny generator PDF-a (jedna strona, Helvetica)          */
/* ---------------------------------------------------------------------- */
function generateMiniPDF(text = '') {
  const encoder = new TextEncoder();

  /* 2.1. Przygotuj strumień treści (tekst na stronie) */
  const lines = text.split(/\r?\n/);
  let   y     = 820;            // start od górnego marginesu
  const body  = [];

  body.push('BT', '/F1 12 Tf');
  for (const raw of lines) {
    if (y < 50) break;          // nie wychodź poza dolny margines
    const safe = raw.replace(/[()\\]/g, '\\$&');
    body.push(`1 0 0 1 50 ${y} Tm (${safe}) Tj`);
    y -= 14;
  }
  body.push('ET');

  const stream = body.join('\n');
  const len    = stream.length;

  /* 2.2. Zbuduj obiekty PDF (5 obiektów + xref) */
  const objects = [];

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n' +
    '   /Resources << /Font << /F1 4 0 R >> >>\n' +
    '   /Contents 5 0 R >>\nendobj\n'
  );
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  );
  objects.push(
    `5 0 obj\n<< /Length ${len} >>\nstream\n${stream}\nendstream\nendobj\n`
  );

  /* 2.3. Poskładaj plik i tabelę xref */
  let pdf = '%PDF-1.4\n';
  const ofs = [0];              // pozycje obiektów

  for (const obj of objects) {
    ofs.push(pdf.length);
    pdf += obj;
  }

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';            // obiekt zerowy
  for (let i = 1; i <= objects.length; i++) {
    pdf += ofs[i].toString().padStart(10, '0') + ' 00000 n \n';
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF`;

  return encoder.encode(pdf);                // Uint8Array
}

/* ---------------------------------------------------------------------- */
/* 3.  Uniwersalna konwersja → Blob                                        */
/* ---------------------------------------------------------------------- */

/* Skraca zapis Blob-ów */
const toBlob = (parts, type) => new Blob(parts, { type });

/* Zapewnia Uint8Array z danych wejściowych dowolnego typu */
const ensureUint8 = (data) => {
  if (data instanceof Uint8Array)  return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string')    return new TextEncoder().encode(data);
  throw new TypeError('Unsupported binary type');
};

/* ---------------------------------------------------------------------- */
/* 4.  GŁÓWNA FUNKCJA                                                     */
/* ---------------------------------------------------------------------- */
export async function convertDocument(file, fmt = 'txt') {
  const format = String(fmt).toLowerCase();
  const text   = await tryReadText(file);          // odczyt UTF-8

  switch (format) {
    /* TXT --------------------------------------------------------------- */
    case 'txt':
      return toBlob([text], 'text/plain;charset=utf-8');

    /* Markdown ---------------------------------------------------------- */
    case 'md': {
      const md =
`# Przekonwertowany dokument

Oryginał: ${file.name}

---

${text}`;
      return toBlob([md], 'text/markdown;charset=utf-8');
    }

    /* HTML-lite --------------------------------------------------------- */
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

    /* PDF-lite ---------------------------------------------------------- */
    case 'pdf-lite': {
      const raw   = generateMiniPDF(text.slice(0, 20_000));
      const bytes = ensureUint8(raw);

      /* prosta walidacja nagłówka */
      const head  = new TextDecoder('ascii').decode(bytes.slice(0, 5));
      if (head !== '%PDF-')
        throw new Error('generateMiniPDF zwrócił dane nie-PDF');

      return toBlob([bytes], 'application/pdf');
    }

    /* RTF-lite ---------------------------------------------------------- */
    case 'rtf-lite': {
      const rtf =
`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20
Przekonwertowano z ${escapeRTF(file.name)}\\par
${escapeRTF(text.slice(0, 5000))}}`;
      return toBlob([rtf], 'application/rtf');
    }

    /* Fallback = TXT ---------------------------------------------------- */
    default:
      return toBlob([text], 'text/plain;charset=utf-8');
  }
}
