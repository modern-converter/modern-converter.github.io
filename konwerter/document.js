/* ---------------------------------------------------------------
   converter-final.js  –  TXT ⇆ PDF  (PL-znaki)  + PDF→TXT  + MD / HTML / RTF
   ------------------------------------------------------------- */

/* ---------- uniwersalne helpery ------------------------------ */
const escapeHTML = (s='') =>
  s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const escapeRTF = (s='') =>
  s.replace(/[\\{}]/g,'\\$&').replace(/\n/g,'\\par ');

async function tryReadText(file,enc='utf-8'){
  if(typeof file?.text==='function') return file.text();
  return new Promise((ok,bad)=>{
    const fr=new FileReader();
    fr.onerror=()=>bad(fr.error);
    fr.onload =()=>ok(fr.result);
    fr.readAsText(file,enc);
  });
}
async function readRaw(file){
  const buf=await file.arrayBuffer();
  return new TextDecoder('latin1').decode(buf);        // 1-1 bajt→znak
}

/* ---------- PL-glyph map & helpers --------------------------- */
const GLYPH={'ą':'aogonek','Ą':'Aogonek','ć':'cacute','Ć':'Cacute','ę':'eogonek',
  'Ę':'Eogonek','ł':'lslash','Ł':'Lslash','ń':'nacute','Ń':'Nacute','ó':'oacute',
  'Ó':'Oacute','ś':'sacute','Ś':'Sacute','ź':'zacute','Ź':'Zacute','ż':'zdotaccent',
  'Ż':'Zdotaccent'};
const ascii=s=>Uint8Array.from([...s].map(ch=>{
  const c=ch.charCodeAt(0);
  return (c===0x0A||(c>=0x20&&c<=0x7E))?c:0x3F;
}));

/* ---------- mini PDF 1-page (PL) ----------------------------- */
function generateMiniPDF(text=''){
  const parts=[],offs=[0];let pos=0;
  const push=u8=>{parts.push(u8);pos+=u8.length;};
  const pushS=s=>push(ascii(s));

  /* ––– nagłówek */
  pushS('%PDF-1.4\n'); push(Uint8Array.of(0x25,0xE2,0xE3,0xCF,0xD3,0x0A));

  /* ––– mapowanie znaków */
  const char2code=(()=>{const m={},seq=[];let n=128;
    return ch=>{
      const cc=ch.charCodeAt(0);
      if(cc>=32&&cc<=126) return cc;
      if(!GLYPH[ch]) return 63;
      if(!(ch in m)){m[ch]=n++; seq.push(m[ch],'/'+GLYPH[ch]);}
      return m[ch];
    };
  })();

  /* zakoduj linie */
  const oct=n=>'\\'+n.toString(8).padStart(3,'0');
  const encLine=ln=>{
    let out=''; for(const ch of ln){
      const code=char2code(ch);
      if(code===40) out+='\\('; else if(code===41) out+='\\)'; else if(code===92) out+='\\\\';
      else if(code>=32&&code<=126) out+=String.fromCharCode(code);
      else out+=oct(code);
    } return out;
  };

  const body=['BT','/F1 12 Tf']; let y=820;
  for(const raw of text.split(/\r?\n/)){ if(y<50)break;
    body.push(`1 0 0 1 50 ${y} Tm (${encLine(raw)}) Tj`); y-=14; }
  body.push('ET');
  const stream=ascii(body.join('\n')),len=stream.length;

  const diffs=(()=>{const arr=[];for(const ch in GLYPH){
    const code=char2code(ch); if(code>=128) arr.push(code,'/'+GLYPH[ch]);}
    return arr.length?' /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [ '+arr.join(' ')+' ] >>':'';
  })();

  const obj=s=>{offs.push(pos);pushS(s);};
  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  obj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]
   /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  obj(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica${diffs} >>\nendobj\n`);

  offs.push(pos); pushS(`5 0 obj\n<< /Length ${len} >>\nstream\n`);
  push(stream); pushS('\nendstream\nendobj\n');

  const xref=pos; pushS(`xref\n0 ${offs.length}\n0000000000 65535 f \n`);
  offs.slice(1).forEach(o=>pushS(o.toString().padStart(10,'0')+' 00000 n \n'));
  pushS(`trailer\n<< /Size ${offs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const pdf=new Uint8Array(pos); let p=0; for(const u of parts){pdf.set(u,p);p+=u.length;}
  return pdf;
}

/* ---------- PDF → TXT extractor (prosty) --------------------- */
async function extractPDFText(file){
  const buf=new Uint8Array(await file.arrayBuffer());
  const str=new TextDecoder('latin1').decode(buf);

  const texts=[];                                         // zebrane linie

  const streamRE=/(\d+\s+\d+\s+obj[\s\S]*?)stream[\r\n]+/g;
  let m;
  while((m=streamRE.exec(str))){
    const header=m[1];                                    // słownik przed stream
    const flate=/\/Filter\s*\/FlateDecode/.test(header);
    const start=streamRE.lastIndex;
    const end=str.indexOf('endstream',start);
    if(end<0) break;
    let chunk=buf.subarray(start,end);

    /* jeśli FlateDecode -> spróbuj rozpakować */
    if(flate && (typeof DecompressionStream==='function')){
      try{
        const ds=new DecompressionStream('deflate');
        const decompressed=await new Response(
          new Blob([chunk]).stream().pipeThrough(ds)).arrayBuffer();
        chunk=new Uint8Array(decompressed);
      }catch{}
    }

    const content=new TextDecoder('latin1').decode(chunk);

    /* wyciągnij (…) Tj   oraz  [(…)] TJ ---------------------- */
    const tj=/\(([^()]*(?:\\.|[^\\]))*?)\)\s*T[Jj]/g;
    let mm;
    while((mm=tj.exec(content))){
      texts.push(unescapePDF(mm[1]));
    }
    const tjArr=/\[\s*((?:\([^)\\]*(?:\\.[^)\\]*)*\)\s*)+)\]\s*TJ/g;
    while((mm=tjArr.exec(content))){
      const inner=/\(([^()]*(?:\\.|[^\\]))*?)\)/g; let sub;
      while((sub=inner.exec(mm[1]))){ texts.push(unescapePDF(sub[1])); }
    }
  }
  return texts.join('\n');
}
const unescapePDF=s=>{
  return s
    .replace(/\\([nrtbf\\()])/g,(m,ch)=>{const t={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',
      '\\':'\\','(':'(',' )':')'}; return t[ch]||ch;})
    .replace(/\\([0-7]{1,3})/g,(m,oct)=>String.fromCharCode(parseInt(oct,8)))
    .replace(/\\\r?\n/g,'');                             // kontynuacja linii
};

/* ---------- Blob helpery ------------------------------------ */
const toBlob=(chunks,type)=>new Blob(chunks,{type});

/* ---------- konwersja główna → Blob ------------------------- */
export async function convertDocument(file,fmt='txt'){
  const f=fmt.toLowerCase();

  /* PDF → TXT (extract) -------------------------------------- */
  if(['txt-extract','pdf-txt','pdf2txt'].includes(f)){
    const txt=await extractPDFText(file);
    return toBlob([txt],'text/plain;charset=utf-8');
  }

  /* RAW dump -------------------------------------------------- */
  if(f==='raw'||f==='pdf-raw'){
    const raw=await readRaw(file);
    return toBlob([raw],'text/plain;charset=latin1');
  }

  /* pozostałe konwersje wymagają wczytania tekstu z pliku ----- */
  const txt=await tryReadText(file);

  switch(f){
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
    case 'pdf-lite':{
      const pdf=generateMiniPDF(txt.slice(0,20_000));
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

/* ---------- wrapper → File z poprawnym rozszerzeniem -------- */
export async function convertAndRename(file,fmt='txt'){
  const blob=await convertDocument(file,fmt);
  const map={pdf:'pdf','pdf-lite':'pdf',md:'md','html-lite':'html','rtf-lite':'rtf',
             raw:'txt','pdf-raw':'txt','txt-extract':'txt','pdf-txt':'txt','pdf2txt':'txt'};
  const ext=map[fmt.toLowerCase()]||'txt';
  const base=file.name.replace(/\.[^.]+$/,'');
  return new File([blob],`${base}.${ext}`,{type:blob.type});
}
