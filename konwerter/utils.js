export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

export const formatsCatalog = {
  image: { label: 'Obraz', formats: ['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite'] },
  audio: { label: 'Audio', formats: ['wav','mp3','m4a','ogg','flac','opus'] },
  video: { label: 'Wideo', formats: ['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov'] },
  document: { label: 'Dokument', formats: ['txt','md','pdf-lite','rtf-lite','html-lite'] },
  archive: { label: 'Archiwum', formats: ['zip-lite','tar-lite'] },
  code: { label: 'Dane', formats: ['txt','json','csv','ndjson-lite'] }
};
export const extToCategory = {
  png:'image', jpg:'image', jpeg:'image', webp:'image', avif:'image', bmp:'image', gif:'image', svg:'image', ico:'image', heic:'image',
  wav:'audio', mp3:'audio', m4a:'audio', ogg:'audio', flac:'audio', opus:'audio',
  txt:'document', md:'document', html:'document', pdf:'document', rtf:'document', docx:'document',
  json:'code', csv:'code', js:'code', ndjson:'code',
  mp4:'video', webm:'video', mov:'video', mkv:'video', avi:'video', hevc:'video'
};
export const labelMap = {
  'png':'PNG (bezstratny)','png-8':'PNG-8 (kompaktowy)','jpeg':'JPEG (wysoka jakość)','jpeg-low':'JPEG (lżejszy)',
  'webp':'WebP','avif':'AVIF (wysoka kompresja)','gif':'GIF','bmp-lite':'BMP (lite)','svg-lite':'SVG (lite)','ico-lite':'ICO (lite)',
  'wav':'WAV (bezstratny)','mp3':'MP3','m4a':'M4A (AAC)','ogg':'OGG','flac':'FLAC (bezstratny)','opus':'OPUS',
  'txt':'TXT','md':'Markdown','pdf-lite':'PDF (lekki)','rtf-lite':'RTF (lekki)','html-lite':'HTML (lekki)',
  'gif-lite':'GIF (lekki)','webm-lite':'WebM (lekki)','thumb-webp':'Miniatura WebP',
  'zip-lite':'ZIP (lekki)','tar-lite':'TAR (lekki)','json':'JSON','csv':'CSV','ndjson-lite':'NDJSON (lekki)',
  'mp4':'MP4 (H.264)','webm':'WebM (VP9)','mov':'MOV'
};

export const compatibleCategoryMap = {
  image:    new Set(['image','document','archive','code']),
  audio:    new Set(['audio']),
  video:    new Set(['video','image','archive','code']),
  document: new Set(['document','image','archive','code']),
  archive:  new Set(['archive']),
  code:     new Set(['code','document','archive'])
};
export const perCategoryAllowedFormats = {
  video: new Set(['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov']),
  image: new Set(['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite','pdf-lite','html-lite','zip-lite','tar-lite','txt','json','csv','ndjson-lite']),
  audio: new Set(['wav','mp3','m4a','ogg','flac','opus']),
  document: new Set(['txt','md','pdf-lite','rtf-lite','html-lite','png','jpeg','webp','svg-lite','zip-lite','tar-lite','json','csv','ndjson-lite']),
  archive: new Set(['zip-lite','tar-lite']),
  code: new Set(['txt','json','csv','ndjson-lite','html-lite','zip-lite','tar-lite'])
};

export function truncate(str, n){
  if(str.length <= n) return str;
  const ext = (str.includes('.') ? '.'+str.split('.').pop() : '');
  const base = str.slice(0, Math.max(0, n - ext.length - 1));
  return base + '…' + ext;
}
export function commonPrefix(arr){
  if(!arr.length) return '';
  let p = arr[0];
  for(let i=1;i<arr.length;i++){
    let j=0; const s = arr[i];
    while(j < p.length && j < s.length && p[j]===s[j]) j++;
    p = p.slice(0,j);
    if(!p) break;
  }
  return p.replace(/[-_. ]+$/,'');
}
export function suggestPackBaseName(items){
  if(!items.length) return 'converted';
  const base = commonPrefix(items.map(i=>i.name.replace(/\.[^.]+$/,''))).trim();
  if(base && base.length >= 3) return base + '-converted';
  return 'converted';
}
export function estimateSafeLimitBytes(){
  const mem = navigator.deviceMemory || 4;
  const cores = (navigator.hardwareConcurrency || 4);
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /iphone|ipad|android|mobile/.test(ua);
  let base = Math.min(mem * 5, 50) * GB;
  if(isMobile) base *= 0.6;
  if(cores <= 2) base *= 3;
  base = Math.max(200*MB, Math.min(base, 50*GB));
  return Math.round(base);
}
export function humanSize(bytes){
  const GBb=1024*1024*1024, MBb=1024*1024, KBb=1024;
  if(bytes >= GBb) return (bytes/GBb).toFixed(2)+' GB';
  if(bytes >= MBb) return (bytes/MBb).toFixed(1)+' MB';
  if(bytes >= KBb) return (bytes/KBb).toFixed(1)+' KB';
  return bytes+' B';
}
export function once(target, event, timeoutMs=0){
  return new Promise((res, rej)=>{
    const on = ()=>{ cleanup(); res(); };
    const to = timeoutMs ? setTimeout(()=>{ cleanup(); rej(new Error('timeout')); }, timeoutMs) : null;
    const cleanup = ()=>{ target.removeEventListener(event, on); if(to) clearTimeout(to); };
    target.addEventListener(event, on, {once:true});
  });
}
export async function synthFrames(n, w, h){
  const frames = [];
  const can = document.createElement('canvas');
  can.width = w; can.height = h;
  const ctx = can.getContext('2d');
  for(let i=0;i<n;i++){
    const t = i / Math.max(1, n-1);
    const g = ctx.createLinearGradient(0,0,w,h);
    const c1 = `hsl(${Math.round(200+120*t)} 80% 50%)`;
    const c2 = `hsl(${Math.round(280+80*t)} 80% 60%)`;
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(20, h-40, 160, 24);
    ctx.fillStyle = 'white'; ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`Klatka ${i+1}`, 26, h-24);
    const b = await new Promise(r=>can.toBlob(r,'image/webp',0.9));
    if(b) frames.push(b);
  }
  return frames;
}
export async function concatBlobs(blobs, type){
  const parts = [];
  for(const b of blobs) parts.push(new Uint8Array(await b.arrayBuffer()));
  const len = parts.reduce((a,p)=>a+p.byteLength,0);
  const out = new Uint8Array(len);
  let off = 0;
  for(const p of parts){ out.set(p, off); off += p.byteLength; }
  return new Blob([out], {type});
}
export async function generatePlaceholderCanvas(w, h, mime='image/png'){
  const can = document.createElement('canvas');
  can.width = w; can.height = h;
  const ctx = can.getContext('2d');
  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0, '#0ea5e9'); g.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText('Wygenerowana grafika', 24, 48);
  const blob = await new Promise(r=>can.toBlob(r, mime, 0.92));
  return {blob, canvas: can};
}
export function generateMiniPDF(text){
  const esc = s => s.replace(/[\$$)]/g, m=> '\\'+m).replace(/\r?\n/g,'\\n');
  const lines = text.split(/\r?\n/).slice(0, 80);
  const content = [];
  content.push('BT /F1 12 Tf 50 780 Td 14 TL');
  for(const ln of lines){
    const t = esc(ln).slice(0, 100);
    content.push('('+t+') Tj T*');
  }
  content.push('ET');
  const contentStream = content.join('\n');

  const objects = [];
  function addObject(str){ objects.push(str); }
  addObject('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  addObject('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  addObject('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj');
  addObject('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  addObject(`5 0 obj << /Length ${contentStream.length} >> stream
${contentStream}
endstream endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for(const obj of objects){
    offsets.push(pdf.length);
    pdf += obj + '\n';
  }
  const xrefPos = pdf.length;
  pdf += 'xref\n0 ' + (objects.length+1) + '\n';
  pdf += '0000000000 65535 f \n';
  for(const off of offsets){
    pdf += String(off).padStart(10,'0') + ' 00000 n \n';
  }
  pdf += `trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
export function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
export function escapeRTF(s){ return s.replace(/[\\{}]/g, m=> '\\'+m).replace(/\n/g,'\\par '); }
export async function tryReadText(file){
  try{ return await file.text(); }
  catch{
    const buf = await file.arrayBuffer();
    try{ return new TextDecoder().decode(buf); }
    catch{ return '[dane binarne]'; }
  }
}
export function fmtToMime(fmt){
  const m = {
    png: 'image/png',
    'png-8':'image/png',
    jpeg: 'image/jpeg',
    'jpeg-low':'image/jpeg',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    'gif-lite': 'image/gif',
    gif: 'image/gif',
    'webm-lite': 'video/webm',
    webm: 'video/webm',
    'thumb-webp':'image/webp',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    flac:'audio/flac',
    opus:'audio/opus',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    wav: 'audio/wav',
    'pdf-lite':'application/pdf',
    'rtf-lite':'application/rtf',
    'html-lite':'text/html',
    'zip-lite':'application/zip',
    'tar-lite':'application/x-tar',
    json:'application/json',
    csv:'text/csv',
    txt:'text/plain',
    md:'text/markdown',
    'svg-lite':'image/svg+xml',
    'bmp-lite':'image/bmp',
    'ico-lite':'image/x-icon',
    'ndjson-lite':'application/x-ndjson'
  };
  return m[fmt] || 'application/octet-stream';
}
export async function loadImage(url){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=> res(img);
    img.onerror = rej;
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}
