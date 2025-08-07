import { generatePlaceholderCanvas, fmtToMime, loadImage } from './utils.js';

export async function convertImage(file, fmt){
  if(fmt==='svg-lite'){
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="24" y="48" font-size="28" font-family="system-ui" fill="#fff">Wygenerowany SVG (lite)</text></svg>`;
    return new Blob([svg], {type:'image/svg+xml'});
  }
  if(fmt==='ico-lite'){
    const {blob} = await generatePlaceholderCanvas(64, 64, 'image/png');
    return new Blob([await blob.arrayBuffer()], {type:'image/x-icon'});
  }
  if(fmt==='bmp-lite'){
    const {blob} = await generatePlaceholderCanvas(480, 300, 'image/png');
    return new Blob([await blob.arrayBuffer()], {type:'image/bmp'});
  }

  const buf = await file.arrayBuffer();
  const blobUrl = URL.createObjectURL(new Blob([buf]));
  const img = await loadImage(blobUrl).catch(()=>null);
  URL.revokeObjectURL(blobUrl);

  const mime = fmtToMime(fmt);
  if(!img){
    const {blob} = await generatePlaceholderCanvas(800, 500, mime);
    return blob;
  }

  const limitMP = (navigator.deviceMemory || 4) >= 8 ? 24 : 10;
  const maxPixels = limitMP * 1_000_000;
  const scale = Math.min(1, Math.sqrt(maxPixels / (img.naturalWidth * img.naturalHeight)));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const can = document.createElement('canvas');
  can.width = w; can.height = h;
  const ctx = can.getContext('2d');
  const opaque = (fmt==='jpeg' || fmt==='jpg' || fmt==='jpeg-low');
  if(opaque){
    const grd = ctx.createLinearGradient(0,0,w,h);
    grd.addColorStop(0,'#0d1117'); grd.addColorStop(1,'#1b2735');
    ctx.fillStyle = grd; ctx.fillRect(0,0,w,h);
  }
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.9;
  if(fmt==='jpeg-low') quality = 0.5;

  if(fmt==='png-8'){
    const b = await new Promise(r=>can.toBlob(r, 'image/png', 0.8));
    return b || new Blob([buf], {type: 'image/png'});
  }

  const b = await new Promise(r=>can.toBlob(r, mime, quality));
  return b || new Blob([buf], {type: mime});
}
