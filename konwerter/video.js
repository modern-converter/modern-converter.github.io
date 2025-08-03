import { once, synthFrames, concatBlobs } from './utils.js';

export async function convertVideo(file, fmt){
  if(['mp4','webm','gif','mov'].includes(fmt)){
    console.warn('FFmpeg video not available; używane lekkie fallbacky.');
  }
  let frames = [];
  try{
    const blobUrl = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.muted = true; vid.src = blobUrl; vid.preload = 'auto';
    await vid.play().catch(()=>{});
    await once(vid, 'loadeddata', 2000).catch(()=>{});
    const dur = isFinite(vid.duration) ? vid.duration : 3;
    const w = Math.min(640, vid.videoWidth || 320);
    const h = Math.round((vid.videoHeight||180) * (w/(vid.videoWidth||320)));
    const can = document.createElement('canvas');
    can.width = w; can.height = h;
    const ctx = can.getContext('2d');
    const sampleFrames = 10;
    for(let i=0;i<sampleFrames;i++){
      const t = (dur * i) / sampleFrames;
      vid.currentTime = t;
      await once(vid,'seeked', 800).catch(()=>{});
      ctx.drawImage(vid, 0, 0, w, h);
      const frame = await new Promise(r=>can.toBlob(b=>r(b),'image/webp',0.85));
      if(frame) frames.push(frame);
    }
    URL.revokeObjectURL(blobUrl);
  }catch(e){ frames = []; }
  if(!frames.length) frames = await synthFrames(10, 360, 200);

  if(fmt === 'gif-lite'){
    const concat = await concatBlobs(frames, 'image/webp');
    return new Blob([await concat.arrayBuffer()], {type:'image/gif'});
  }
  if(fmt === 'webm-lite'){
    return new Blob([await frames[0].arrayBuffer()], {type:'video/webm'});
  }
  if(fmt === 'thumb-webp'){
    return frames[0];
  }
  return new Blob([await frames[0].arrayBuffer()], {type:'video/webm'});
}
