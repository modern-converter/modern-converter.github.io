/* utils.js  – 2025-08-04  */
/* ─────────────────────────────────────────────────────────── *
 *  Stałe, katalog formatów, mapy zgodności, pomocnicze utilsy *
 *  +  poprawiony generateMiniPDF                             *
 * ─────────────────────────────────────────────────────────── */

export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

/* ---------- katalog UI ---------- */
export const formatsCatalog = {
  image   : { label: 'Obraz',   formats: ['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite'] },
  audio   : { label: 'Audio',   formats: ['wav','mp3','m4a','ogg','flac','opus'] },
  video   : { label: 'Wideo',   formats: ['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov'] },
  document: { label: 'Dokument',formats: ['txt','md','pdf-lite','rtf-lite','html-lite'] },
  archive : { label: 'Archiwum',formats: ['zip-lite','tar-lite'] },
  code    : { label: 'Dane',    formats: ['txt','json','csv','ndjson-lite'] }
};

/* ---------- mapy rozszerzeń ---------- */
export const extToCategory = {
  /* images */  png:'image',jpg:'image',jpeg:'image',webp:'image',avif:'image',bmp:'image',gif:'image',svg:'image',ico:'image',heic:'image',
  /* audio  */  wav:'audio',mp3:'audio',m4a:'audio',ogg:'audio',flac:'audio',opus:'audio',
  /* docs   */  txt:'document',md:'document',html:'document',pdf:'document',rtf:'document',docx:'document',
  /* code   */  json:'code',csv:'code',js:'code',ndjson:'code',
  /* video  */  mp4:'video',webm:'video',mov:'video',mkv:'video',avi:'video',hevc:'video'
};

export const labelMap = {
  /* images */
  'png':'PNG (bezstratny)','png-8':'PNG-8 (kompaktowy)','jpeg':'JPEG (wysoka jakość)','jpeg-low':'JPEG (lżejszy)',
  'webp':'WebP','avif':'AVIF (wysoka kompresja)','gif':'GIF','bmp-lite':'BMP (lite)','svg-lite':'SVG (lite)','ico-lite':'ICO (lite)',
  /* audio  */
  'wav':'WAV (bezstratny)','mp3':'MP3','m4a':'M4A (AAC)','ogg':'OGG','flac':'FLAC (bezstratny)','opus':'OPUS',
  /* docs   */
  'txt':'TXT','md':'Markdown','pdf-lite':'PDF (lekki)','rtf-lite':'RTF (lekki)','html-lite':'HTML (lekki)',
  /* video  */
  'gif-lite':'GIF (lekki)','webm-lite':'WebM (lekki)','thumb-webp':'Miniatura WebP',
  /* misc   */
  'zip-lite':'ZIP (lekki)','tar-lite':'TAR (lekki)',
  'json':'JSON','csv':'CSV','ndjson-lite':'NDJSON (lekki)',
  'mp4':'MP4 (H.264)','webm':'WebM (VP9)','mov':'MOV'
};

/* ---------- zgodność kategorii ---------- */
export const compatibleCategoryMap = {
  image:    new Set(['image','document','archive','code']),
  audio:    new Set(['audio']),
  video:    new Set(['video','image','archive','code']),
  document: new Set(['document','image','archive','code']),
  archive:  new Set(['archive']),
  code:     new Set(['code','document','archive'])
};
export const perCategoryAllowedFormats = {
  video   : new Set(['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov']),
  image   : new Set(['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite','pdf-lite','html-lite','zip-lite','tar-lite','txt','json','csv','ndjson-lite']),
  audio   : new Set(['wav','mp3','m4a','ogg','flac','opus']),
  document: new Set(['txt','md','pdf-lite','rtf-lite','html-lite','png','jpeg','webp','svg-lite','zip-lite','tar-lite','json','csv','ndjson-lite']),
  archive : new Set(['zip-lite','tar-lite']),
  code    : new Set(['txt','json','csv','ndjson-lite','html-lite','zip-lite','tar-lite'])
};

/* ───────────────────────────── Helpers UI / nazwy ───────────────────────────── */
export function truncate(str, n){
  if(str.length <= n) return str;
  const ext = str.includes('.') ? '.' + str.split('.').pop() : '';
  const base = str.slice(0, Math.max(0, n - ext.length - 1));
  return base + '…' + ext;
}
export function commonPrefix(arr){
  if(!arr.length) return '';
  let p = arr[0];
  for(let i=1;i<arr.length;i++){
    let j=0, s=arr[i];
    while(j<p.length && j<s.length && p[j]===s[j]) j++;
    p = p.slice(0,j); if(!p) break;
  }
  return p.replace(/[-_. ]+$/,'');
}
export function suggestPackBaseName(items){
  if(!items.length) return 'converted';
  const base = commonPrefix(items.map(i=>i.name.replace(/\.[^.]+$/,''))).trim();
  return base && base.length>=3 ? base+'-converted' : 'converted';
}

/* ───────────────────────────── memory / size helpers ───────────────────────────── */
export function estimateSafeLimitBytes(){
  const mem   = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const ua    = navigator.userAgent.toLowerCase();
  const mobile= /iphone|ipad|android|mobile/.test(ua);
  let base    = Math.min(mem * 5, 50) * GB;
  if(mobile) base *= .6;
  if(cores<=2) base *= 3;
  base = Math.max(200*MB, Math.min(base, 50*GB));
  return Math.round(base);
}
export function humanSize(bytes){
  if(bytes >= GB) return (bytes/GB).toFixed(2)+' GB';
  if(bytes >= MB) return (bytes/MB).toFixed(1)+' MB';
  if(bytes >= KB) return (bytes/KB).toFixed(1)+' KB';
  return bytes+' B';
}

/* ───────────────────────────── dom / async helpers ───────────────────────────── */
export function once(target, event, timeoutMs=0){
  return new Promise((res, rej)=>{
    const on = () => { cleanup(); res(); };
    const to = timeoutMs ? setTimeout(()=>{ cleanup(); rej(new Error('timeout')); }, timeoutMs) : null;
    const cleanup = () => { target.removeEventListener(event, on); if(to) clearTimeout(to); };
    target.addEventListener(event, on, {once:true});
  });
}

/* ───────────────────────────── synth utilities (demo) ───────────────────────────── */
export async function synthFrames(n,w,h){
  const frames=[], can=document.createElement('canvas');
  can.width=w; can.height=h; const ctx=can.getContext('2d');
  for(let i=0;i<n;i++){
    const t=i/Math.max(1,n-1);
    const g=ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,`hsl(${Math.round(200+120*t)} 80% 50%)`);
    g.addColorStop(1,`hsl(${Math.round(280+80*t)} 80% 60%)`);
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(20,h-40,160,24);
    ctx.fillStyle='#fff'; ctx.font='bold 14px system-ui';
    ctx.fillText(`Klatka ${i+1}`,26,h-24);
    const b=await new Promise(r=>can.toBlob(r,'image/webp',0.9)); if(b) frames.push(b);
  }
  return frames;
}
export async function concatBlobs(blobs,type){
  const parts=[]; for(const b of blobs) parts.push(new Uint8Array(await b.arrayBuffer()));
  const len=parts.reduce((a,p)=>a+p.length,0), out=new Uint8Array(len);
  let off=0; for(const p of parts){ out.set(p,off); off+=p.length; }
  return new Blob([out],{type});
}
export async function generatePlaceholderCanvas(w,h,mime='image/png'){
  const can=document.createElement('canvas'); can.width=w; can.height=h;
  const ctx=can.getContext('2d');
  const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#0ea5e9'); g.addColorStop(1,'#8b5cf6');
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='rgba(255,255,255,.85)'; ctx.font='bold 28px system-ui'; ctx.fillText('Wygenerowana grafika',24,48);
  const blob=await new Promise(r=>can.toBlob(r,mime,0.92));
  return { blob, canvas: can };
}

/* ───────────────────────────── PDF generator (poprawiony) ───────────────────────────── */
export function generateMiniPDF(text=''){
  /* 1. sanitizacja → ASCII 7-bit */
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g,'\n')
                    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g,'');
  const lines = clean.split('\n').slice(0, 60);           // max ~60 linii
  const pageW = 595, pageH = 842, top = pageH-72, leading=14;
  const content = ['BT /F1 12 Tf 72 '+top+' Td '+leading+' TL'];
  let y = 0;
  for(const l of lines){
    const safe = l.replace(/([\\()])/g,'\\$1').slice(0,100);
    content.push(`(${safe}) Tj T*`); y += leading;
  }
  content.push('ET');
  const stream = content.join('\n');

  const objects=[];
  const add=o=>{objects.push(o); return objects.length;};

  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const contents = add(`<< /Length ${stream.length} >> stream\n${stream}\nendstream`);
  const page = add(`<< /Type /Page /Parent 4 0 R /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R /MediaBox [0 0 ${pageW} ${pageH}] >>`);
  const pages= add(`<< /Type /Pages /Count 1 /Kids [${page} 0 R] >>`);
  const root = add('<< /Type /Catalog /Pages 4 0 R >>');

  let pdf='%PDF-1.4\n', xrefOff=[], offset=pdf.length;
  const write=o=>{xrefOff.push(offset); pdf+=o+'\n'; offset=pdf.length;};
  objects.forEach((o,i)=>write(`${i+1} 0 obj\n${o}\nendobj`));

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  xrefOff.forEach(off=> pdf+= off.toString().padStart(10,'0')+' 00000 n \n');
  pdf += `trailer\n<< /Size ${objects.length+1} /Root ${root} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

/* ───────────────────────────── mini escapery ───────────────────────────── */
export function escapeHTML(s=''){ return s.replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
export function escapeRTF(s=''){ return s.replace(/[\\{}]/g,'\\$&').replace(/\n/g,'\\par '); }

/* ───────────────────────────── file helpers ───────────────────────────── */
export async function tryReadText(file){
  if(file.text) try{ return await file.text(); }catch{}
  try{ return new TextDecoder().decode(await file.arrayBuffer()); }
  catch{ return '[dane binarne]'; }
}

/* ───────────────────────────── mimetype helper ───────────────────────────── */
export function fmtToMime(fmt){
  const map = {
    png:'image/png','png-8':'image/png',jpeg:'image/jpeg','jpeg-low':'image/jpeg',
    jpg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif','gif-lite':'image/gif',
    'bmp-lite':'image/bmp','svg-lite':'image/svg+xml','ico-lite':'image/x-icon',
    mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',flac:'audio/flac',opus:'audio/opus',
    wav:'audio/wav',
    mp4:'video/mp4',webm:'video/webm','webm-lite':'video/webm',mov:'video/quicktime',
    'thumb-webp':'image/webp',
    'pdf-lite':'application/pdf','rtf-lite':'application/rtf','html-lite':'text/html',
    txt:'text/plain',md:'text/markdown',json:'application/json',csv:'text/csv','ndjson-lite':'application/x-ndjson',
    'zip-lite':'application/zip','tar-lite':'application/x-tar'
  };
  return map[fmt] || 'application/octet-stream';
}

/* ───────────────────────────── obrazek loader ───────────────────────────── */
export async function loadImage(url){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.crossOrigin='anonymous'; img.onload=()=>res(img); img.onerror=rej; img.src=url;
  });
}
