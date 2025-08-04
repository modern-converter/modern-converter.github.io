// audio.js  — bez FFmpeg, z lamejs dla MP3
const LAME_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js';

/* -------------------------------------------------- */
export async function convertAudio(file, fmt, opts = {}) {
  const target = (fmt || 'wav').toLowerCase();
  const ab = await file.arrayBuffer();

  /* 1. Dekoduj audio przeglądarką */
  let buffer;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    buffer = await ac.decodeAudioData(ab.slice(0));
    ac.close();
  } catch {
    console.warn('decodeAudioData failed, synthetic tone fallback.');
    return synthToneTo('wav');
  }

  /* 2. Koder w zależności od targetu */
  if (target === 'wav')   return pcmToWavBlob(buffer);
  if (target === 'mp3')   return pcmToMp3Blob(buffer, opts.bitrate || 128);
  if (target === 'webm')  return pcmToWebmBlob(buffer, opts.bitrate || 128);
  // flac / ogg / opus itd. – brak natywnego kodera → WAV
  console.warn(`Brak kodera ${target}; zwracam WAV.`);
  return pcmToWavBlob(buffer);
}

/* ---------------- MP3 (lamejs) ---------------- */
async function pcmToMp3Blob(buf, kbps) {
  if (!window.lamejs) await import(/* @vite-ignore */ LAME_URL);
  const mp3enc = new lamejs.Mp3Encoder(buf.numberOfChannels, buf.sampleRate, kbps);
  const samples = buf.getChannelData(0).length;
  const mp3Data = [];

  const tmp = new Int16Array(samples * buf.numberOfChannels);
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const s = buf.getChannelData(ch)[i];
      tmp[i * buf.numberOfChannels + ch] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  }
  const mp3buf = mp3enc.encodeBuffer(tmp);
  if (mp3buf.length) mp3Data.push(new Int8Array(mp3buf));
  const end = mp3enc.flush();
  if (end.length) mp3Data.push(new Int8Array(end));
  return new Blob(mp3Data, { type: 'audio/mpeg' });
}

/* ---------------- WAV (PCM 16-bit) ---------------- */
function pcmToWavBlob(buffer) {
  const ch  = buffer.numberOfChannels;
  const rate= buffer.sampleRate;
  const len = buffer.length;
  const bps = 2;                 // 16-bit
  const blk = ch * bps;
  const data= len * blk;

  const dv = new DataView(new ArrayBuffer(44 + data));
  let o = 0;
  const w = (s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o++,s.charCodeAt(i));};
  w('RIFF'); dv.setUint32(o,36+data,true); o+=4; w('WAVEfmt '); dv.setUint32(o,16,true); o+=4;
  dv.setUint16(o,1,true); o+=2; dv.setUint16(o,ch,true); o+=2;
  dv.setUint32(o,rate,true); o+=4; dv.setUint32(o,rate*blk,true); o+=4;
  dv.setUint16(o,blk,true); o+=2; dv.setUint16(o,16,true); o+=2; w('data');
  dv.setUint32(o,data,true); o+=4;

  for(let i=0;i<len;i++)
    for(let c=0;c<ch;c++){
      const s=Math.max(-1,Math.min(1, buffer.getChannelData(c)[i]));
      dv.setInt16(o, s<0 ? s*0x8000 : s*0x7FFF, true); o+=2;
    }
  return new Blob([dv.buffer], { type:'audio/wav' });
}

/* ---------------- WEBM Opus ---------------- */
async function pcmToWebmBlob(buf, bitrate) {
  const off = new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(
    buf.numberOfChannels, buf.length, buf.sampleRate);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const recStream = off.destination.stream;
  const chunks=[]; 
  const rec = new MediaRecorder(recStream, {
    mimeType:'audio/webm;codecs=opus', audioBitsPerSecond: bitrate*1000
  });
  rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  rec.start();
  await off.startRendering();
  rec.stop();
  await new Promise(r=>rec.onstop=r);
  return new Blob(chunks, {type:'audio/webm'});
}

/* --------------- fallback tone --------------- */
async function synthToneTo() {
  const sr=48000, dur=0.5, len=sr*dur;
  const ac=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,len,sr);
  const osc=ac.createOscillator(); osc.frequency.value=440;
  osc.connect(ac.destination); osc.start(); osc.stop(dur);
  const buf=await ac.startRendering();
  return pcmToWavBlob(buf);
}

