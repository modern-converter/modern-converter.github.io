import { escapeHTML, escapeRTF, tryReadText, generateMiniPDF } from './utils.js';

export async function convertDocument(file, fmt){
  const text = await tryReadText(file);
  if(fmt==='txt') return new Blob([text], {type:'text/plain'});
  if(fmt==='md'){
    const md = `# Przekonwertowany dokument\n\nOryginał: ${file.name}\n\n---\n\n${text}`;
    return new Blob([md], {type:'text/markdown'});
  }
  if(fmt==='html-lite'){
    const safe = escapeHTML(text).slice(0, 20000).replace(/\n/g,'<br>');
    const html = `<!doctype html><meta charset="utf-8"><title>${escapeHTML(file.name)}</title><style>body{font-family:system-ui;margin:20px;line-height:1.5}</style><h1>${escapeHTML(file.name)}</h1><div>${safe}</div>`;
    return new Blob([html], {type:'text/html'});
  }
  if(fmt==='pdf-lite'){
    const pdfBytes = generateMiniPDF(text.slice(0, 20000));
    return new Blob([pdfBytes], {type:'application/pdf'});
  }
  if(fmt==='rtf-lite'){
    const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20 Przekonwertowano z ${escapeRTF(file.name)}\\par ${escapeRTF(text.slice(0,5000))}}`;
    return new Blob([rtf], {type:'application/rtf'});
  }
  return new Blob([text], {type:'text/plain'});
}
