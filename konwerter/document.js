import {
  escapeHTML,
  escapeRTF,
  tryReadText,
  generateMiniPDF
} from './utils.js';

/** Pomocnicze, żeby nie powtarzać new Blob([...]) */
const toBlob = (parts, type) => new Blob(parts, { type });

export async function convertDocument(file, fmt = 'txt') {
  const format = String(fmt).toLowerCase();        // case-insensitive
  const text   = await tryReadText(file);           // zakładamy, że rzuca wyjątek gdy nie-txt

  switch (format) {
    /* TXT ------------------------------------------------------------------ */
    case 'txt':
      return toBlob([text], 'text/plain;charset=utf-8');

    /* Markdown ------------------------------------------------------------- */
    case 'md': {
      const md =
`# Przekonwertowany dokument

Oryginał: ${file.name}

---

${text}`;
      return toBlob([md], 'text/markdown;charset=utf-8');
    }

    /* HTML-lite ------------------------------------------------------------ */
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

    /* PDF-lite ------------------------------------------------------------- */
    case 'pdf-lite': {
      const pdfBytes = generateMiniPDF(text.slice(0, 20_000));
      const bytes    = pdfBytes instanceof Uint8Array ? pdfBytes
                      : new Uint8Array(pdfBytes);       // gdy dostaniemy ArrayBuffer
      return toBlob([bytes], 'application/pdf');
    }

    /* RTF-lite ------------------------------------------------------------- */
    case 'rtf-lite': {
      const rtf =
`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20
Przekonwertowano z ${escapeRTF(file.name)}\\par
${escapeRTF(text.slice(0, 5000))}}`;
      return toBlob([rtf], 'application/rtf');
    }

    /* Fallback = TXT ------------------------------------------------------- */
    default:
      return toBlob([text], 'text/plain;charset=utf-8');
  }
}
