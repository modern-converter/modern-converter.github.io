/* audio.js – bez FFmpeg, dynamiczne MP3 przez lamejs */

const LAME_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js';

/* główna funkcja */
export async function convertAudio(file, fmt, opt = {}) {
  const target = (fmt || 'wav').toLowerCase();
  const arrayBuf = await file.arrayBuffer();

  /* Dekoduj wejście */
  let buffer;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    buffer = await ac.decodeAudioData(arrayBuf.slice(0));
    ac.close();
  } catch {
    console.warn('decodeAudioData failed → fallback tone.');
    return synthTone();
  }

  if (target === 'wav')  return pcmToWav(buffer);
  if (target === 'webm') return pcmToWebm(buffer, opt.bitrate || 128);
  if (target === 'mp3')  return pcmToMp3(buffer,  opt.bitrate || 128);

  console.warn(`Brak kodera ${target}; zwracam WAV.`);
  return pcmToWav(buffer);
}

/* ---------- MP3 (lamejs) ---------- */
async function pcmToMp3(buf, kbps) {
  if (!window.lamejs) {
    const m = await import(/* @vite-ignore */ LAME_URL);
    window.lamejs = m.default || m.lamejs || m;   // przypisz globalnie
  }
  const nch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const mp3enc = new lamejs.Mp3Encoder(nch, sr, kbps);
  const mp3Data = [];

  /* Int16 interleaved */
  const tmp = new Int16Array(len * nch);
  for (let i = 0; i < len; i++)
    for (let c = 0; c < nch; c++)
      tmp[i * nch + c] = Math.max(-32768, Math.min(32767,
        buf.getChannelData(c)[i] * 32767));

  const mp3buf = mp3enc.encodeBuffer(tmp);
  if (mp3buf.length) mp3Data.push(new Int8Array(mp3buf));
  const d = mp3enc.flush();
  if (d.length) mp3Data.push(new Int8Array(d));

  return new Blob(mp3Data, { type: 'audio/mpeg' });
}

/* ---------- WAV ---------- */
function pcmToWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const bps = 2, blk = ch * bps, data = len * blk;
  const dv = new DataView(new ArrayBuffer(44 + data));
  let o = 0;
  const w = s => { for (let i=0;i<s.length;i++) dv.setUint8(o++, s.charCodeAt(i)); };
  w('RIFF'); dv.setUint32(o, 36 + data, true); o+=4; w('WAVEfmt ');
  dv.setUint32(o, 16, true); o+=4; dv.setUint16(o, 1, true); o+=2;
  dv.setUint16(o, ch, true); o+=2; dv.setUint32(o, sr, true); o+=4;
  dv.setUint32(o, sr*blk, true); o+=4; dv.setUint16(o, blk, true); o+=2;
  dv.setUint16(o, 16, true); o+=2; w('data'); dv.setUint32(o, data, true); o+=4;

  for (let i=0;i<len;i++)
    for (let c=0;c<ch;c++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2;
    }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}

/* ---------- WebM Opus ---------- */
async function pcmToWebm(buf, kbps) {
  const off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    buf.numberOfChannels, buf.length, buf.sampleRate);
  const src = off.createBufferSource(); src.buffer = buf;
  src.connect(off.destination); src.start();
  const stream = off.destination.stream;
  const chunks=[];
  const rec = new MediaRecorder(stream, {
    mimeType:'audio/webm;codecs=opus',
    audioBitsPerSecond: kbps * 1000
  });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.start();
  await off.startRendering();
  rec.stop(); await new Promise(r=>rec.onstop=r);
  return new Blob(chunks, { type:'audio/webm' });
}

/* ---------- fallback tone ---------- */
async function synthTone(){
  const sr=48000,dur=0.5,len=sr*dur;
  const ctx=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,len,sr);
  const o=ctx.createOscillator(); o.frequency.value=440; o.connect(ctx.destination);
  o.start(); o.stop(dur);
  const b=await ctx.startRendering();
  return pcmToWav(b);
}
