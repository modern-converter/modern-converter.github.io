/* ---------------------------------------------------------------
   converter-final.js  –  TXT ⇆ PDF (PL znaki) + MD / HTML / RTF
   ------------------------------------------------------------- */

/* ---------- drobne helpery ----------------------------------- */
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

async function readRaw(file) {
  const buf = await file.arrayBuffer();
  return new TextDecoder('latin1').decode(buf);   // 1-to-1 bajty→znaki
}

/* ---------- tabela nazw glifów -------------------------------- */
const GLYPH = {
  'ą':'aogonek',  'Ą':'Aogonek',
  'ć':'cacute',   'Ć':'Cacute',
  'ę':'eogonek',  'Ę':'Eogonek',
  'ł':'lslash',   'Ł':'Lslash',
  'ń':'nacute',   'Ń':'Nacute',
  'ó':'oacute',   'Ó':'Oacute',
  'ś':'sacute',   'Ś':'Sacute',
  'ź':'zacute',   'Ź':'Zacute',
  'ż':'zdotaccent','Ż':'Zdotaccent'
};

/* ---------- ASCII-only encoder (komendy PDF) ------------------ */
const ascii = s =>
  Uint8Array.from([...s].map(ch => {
    const c = ch.charCodeAt(0);
    return (c === 0x0A || (c >= 0x20 && c <= 0x7E)) ? c : 0x3F;
  }));

/* ---------- generator PDF z /Differences ---------------------- */
function generateMiniPDF(text='') {

  /* 1) zbierz mapowanie znak→kod 128-255 + Differences ---------- */
  const mapChar = (() => {
    const custom = Object.create(null);
    let  next    = 128;
    const diffs  = [];          // [code, '/Glyph', '/Glyph' …]
    return (ch, collect=false) => {
      const cc = ch.charCodeAt(0);
      if (cc >= 32 && cc <= 126) return cc;          // ASCII
      if (!GLYPH[ch]) return 63;                     // brak w tabeli → '?'
      if (!(ch in custom)) {
        custom[ch] = next++;
        if (collect) { diffs.push(custom[ch], '/' + GLYPH[ch]); }
      }
      return custom[ch];
    };
  })();

  /* pierwsze przebieg – zbierz Differences */
  for (const ch of text) mapChar(ch, true);

  /* zbuduj tablicę Differences jeśli potrzebna */
  const diffArr = (() => {
    if (mapChar('').length === 0) return '';          // brak – pusta
  })();

  /* Differences – złóż do PDF‐owego stringu */
  let diffStr = '';
  const diffCodes = [];
  const diffNames = [];
  for (const ch in GLYPH) {
    const code = mapChar(ch);
    if (code >= 128) { diffCodes.push(code); diffNames.push('/'+GLYPH[ch]); }
  }
  if (diffCodes.length) {
    diffStr = '[ ' + diffCodes[0] + ' ' + diffNames.join(' ') + ' ]';
  }

  /* 2) zakoduj każdą linię z okt. escape ------------------------ */
  const oct = n => '\\' + n.toString(8).padStart(3,'0');
  const encodeLine = ln => {
    let out = '';
    for (const ch of ln) {
      const code = mapChar(ch);
      if (code === 40)         out += '\\(';           // (
      else if (code === 41)    out += '\\)';           // )
      else if (code === 92)    out += '\\\\';          // backslash
      else if (code >= 32 && code <= 126) out += String.fromCharCode(code);
      else out += oct(code);                          // \ddd
    }
    return out;
  };

  /* 3) zbuduj zawartość strumienia ----------------------------- */
  const body = ['BT','/F1 12 Tf'];  let y = 820;
  for (const raw of text.split(/\r?\n/)) {
    if (y < 50) break;
    body.push(`1 0 0 1 50 ${y} Tm (${encodeLine(raw)}) Tj`);
    y -= 14;
  }
  body.push('ET');
  const stream = ascii(body.join('\n'));
  const len    = stream.length;

  /* 4) zacznij składać obiekty --------------------------------- */
  const parts = [];  const offs=[0]; let pos=0;
  const push  = u8=>{parts.push(u8); pos+=u8.length;};
  const pushS = s =>push(ascii(s));

  pushS('%PDF-1.4\n');                         // header
  push(Uint8Array.of(0x25,0xE2,0xE3,0xCF,0xD3,0x0A));

  const obj = s=>{offs.push(pos); pushS(s);};

  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');

  /* font z /Encoding /Differences (jeśli są) */
  const fontEnc = diffStr
    ? `/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${diffStr} >>`
    : '';
  obj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]
   /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  obj(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${fontEnc} >>\nendobj\n`);

  /* strumień --------------------------------------------------- */
  offs.push(pos);
  pushS(`5 0 obj\n<< /Length ${len} >>\nstream\n`);
  push(stream);
  pushS('\nendstream\nendobj\n');

  /* xref ------------------------------------------------------- */
  const xPos=pos;
  pushS(`xref\n0 ${offs.length}\n0000000000 65535 f \n`);
  offs.slice(1).forEach(o=>pushS(o.toString().padStart(10,'0')+' 00000 n \n'));

  pushS(`trailer\n<< /Size ${offs.length} /Root 1 0 R >>\nstartxref\n${xPos}\n%%EOF\n`);

  const pdf = new Uint8Array(pos);
  let p=0; for(const u of parts){pdf.set(u,p); p+=u.length;}
  return pdf;
}

/* ---------- Blob helpery ------------------------------------- */
const toBlob  = (chunks, type) => new Blob(chunks, { type });

/* ---------- konwersja → Blob --------------------------------- */
export async function convertDocument(file, fmt='txt') {
  const f = fmt.toLowerCase();

  if (f==='raw'||f==='pdf-raw') {
    const raw = await readRaw(file);
    return toBlob([raw],'text/plain;charset=latin1');
  }

  const txt = await tryReadText(file);

  switch (f) {
    case 'txt':
      return toBlob([txt],'text/plain;charset=utf-8');

    case 'md':
      return toBlob([`# Przekonwertowany dokument

Oryginał: ${file.name}

---

${txt}`],'text/markdown;charset=utf-8');

    case 'html-lite':
      return toBlob([`<!doctype html><meta charset="utf-8">
<title>${escapeHTML(file.name)}</title>
<style>body{font-family:system-ui;margin:20px;line-height:1.5;white-space:pre-wrap}h1{margin-top:0}</style>
<h1>${escapeHTML(file.name)}</h1>
<div>${escapeHTML(txt).slice(0,20_000)}</div>`],'text/html;charset=utf-8');

    case 'pdf':
    case 'pdf-lite': {
      const pdf = generateMiniPDF(txt.slice(0,20_000));
      return toBlob([pdf],'application/pdf');
    }

    case 'rtf-lite':
      return toBlob([`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20
Przekonwertowano z ${escapeRTF(file.name)}\\par
${escapeRTF(txt.slice(0,5000))}}`],'application/rtf');

    default:
      return toBlob([txt],'text/plain;charset=utf-8');
  }
}

/* ---------- wrapper → File z poprawnym rozszerzeniem ---------- */
export async function convertAndRename(file, fmt='txt') {
  const blob = await convertDocument(file, fmt);
  const ext  = ({'pdf':'pdf','pdf-lite':'pdf','md':'md',
                 'html-lite':'html','rtf-lite':'rtf',
                 'raw':'txt','pdf-raw':'txt'})[fmt.toLowerCase()] || 'txt';
  const base = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
