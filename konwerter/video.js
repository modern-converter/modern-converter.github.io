// ffmpeg-auto.js
// Automatyczne ładowanie FFmpeg.wasm z CDN – nic nie hostujesz u siebie.

let ffmpeg = null;
let loaded = false;
let loadingPromise = null;

export async function ensureFFmpeg({
  log = false,
  // Możesz zmienić CDN (unpkg/jsDelivr/skypack). Ważne: wskazuj na ffmpeg-core.js
  corePath = 'https://unpkg.com/@ffmpeg/core@0.12.6/ffmpeg-core.js',
  timeoutMs = 25000,
} = {}) {
  if (loaded) return ffmpeg;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const { createFFmpeg, fetchFile } = await import('@ffmpeg/ffmpeg');
      const inst = createFFmpeg({
        log,
        corePath,
        progress: ({ ratio }) => {
          // ratio 0..1 – możesz wyświetlać postęp ładowania/enkodowania
          // np. window.dispatchEvent(new CustomEvent('ffmpeg-progress', { detail: ratio }));
        },
      });
      // Timeout, żeby nie wisieć w nieskończoność
      await Promise.race([
        inst.load(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('FFmpeg load timeout')), timeoutMs)),
      ]);
      inst._fetchFile = fetchFile;
      ffmpeg = inst;
      loaded = true;
      return ffmpeg;
    } catch (e) {
      console.warn('Nie udało się załadować FFmpeg.wasm z CDN:', e);
      loaded = false;
      ffmpeg = null;
      return null;
    }
  })();

  return loadingPromise;
}

function guessMimeByExt(ext) {
  const map = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    gif: 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

// Wspólna funkcja: uruchom zadanie FFmpeg
async function runFFmpeg(file, args, outName, mime) {
  const inputExt = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const inName = `input.${inputExt}`;
  ffmpeg.FS('writeFile', inName, await ffmpeg._fetchFile(file));
  await ffmpeg.run(...['-i', inName, ...args, outName]);
  const data = ffmpeg.FS('readFile', outName);
  const blob = new Blob([data.buffer], { type: mime });
  try { ffmpeg.FS('unlink', inName); } catch {}
  try { ffmpeg.FS('unlink', outName); } catch {}
  return blob;
}

// API konwersji (pełny tryb z FFmpeg)
export async function convertMp4ToMp3(file, { bitrate = '192k', ffmpegOpts } = {}) {
  const inst = await ensureFFmpeg(ffmpegOpts);
  if (!inst) return await extractAudioFallback(file, 'wav'); // fallback bez MP3
  return runFFmpeg(file, ['-vn', '-b:a', bitrate], 'out.mp3', 'audio/mpeg');
}

export async function convertToMp4(file, { crf = 23, preset = 'medium', aBitrate = '160k', ffmpegOpts } = {}) {
  const inst = await ensureFFmpeg(ffmpegOpts);
  if (!inst) throw new Error('FFmpeg nie dostępny (CDN) i brak sensownego fallbacku do MP4).');
  return runFFmpeg(
    file,
    ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-c:a', 'aac', '-b:a', aBitrate, '-movflags', '+faststart'],
    'out.mp4',
    'video/mp4'
  );
}

export async function convertToMov(file, { crf = 23, preset = 'medium', aBitrate = '160k', ffmpegOpts } = {}) {
  const inst = await ensureFFmpeg(ffmpegOpts);
  if (!inst) throw new Error('FFmpeg nie dostępny (CDN).');
  return runFFmpeg(
    file,
    ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-c:a', 'aac', '-b:a', aBitrate],
    'out.mov',
    'video/quicktime'
  );
}

export async function convertToWebm(file, { crf = 30, aBitrate = '128k', ffmpegOpts } = {}) {
  const inst = await ensureFFmpeg(ffmpegOpts);
  if (!inst) throw new Error('FFmpeg nie dostępny (CDN).');
  return runFFmpeg(
    file,
    ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-c:a', 'libopus', '-b:a', aBitrate],
    'out.webm',
    'video/webm'
  );
}

export async function convertToMkv(file, { crf = 23, preset = 'medium', aBitrate = '160k', ffmpegOpts } = {}) {
  const inst = await ensureFFmpeg(ffmpegOpts);
  if (!inst) throw new Error('FFmpeg nie dostępny (CDN).');
  return runFFmpeg(
    file,
    ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-c:a', 'aac', '-b:a', aBitrate],
    'out.mkv',
    'video/x-matroska'
  );
}

export async function extractToWav(file, { sampleRate = 48000, ffmpegOpts } = {}) {
  const inst = await ensureFFmpeg(ffmpegOpts);
  if (!inst) return await extractAudioFallback(file, 'wav');
  return runFFmpeg(
    file,
    ['-vn', '-acodec', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '2'],
    'out.wav',
    'audio/wav'
  );
}

// Prosty fallback bez FFmpeg – tylko WAV/WEBM na bazie Web Audio/MediaRecorder
export async function extractAudioFallback(file, target = 'wav') {
  const ab = await file.arrayBuffer();
  const actx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await actx.decodeAudioData(ab).catch(() => null);
  if (!buf) {
    actx.close();
    throw new Error('Nie można zdekodować audio w przeglądarce.');
  }
  if (target === 'wav') {
    const wav = audioBufferToWavBlob(buf);
    actx.close();
    return wav;
  }
  // WEBM (opus) – realtime
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  const chunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 128000 });
  await new Promise((resolve) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = resolve;
    rec.start(200);
    src.start();
    src.onended = () => rec.stop();
  });
  actx.close();
  return new Blob(chunks, { type: mime });
}

function audioBufferToWavBlob(buffer) {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = length * blockAlign;

  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);
  let o = 0;
  const wU32 = v => (dv.setUint32(o, v, true), o += 4);
  const wU16 = v => (dv.setUint16(o, v, true), o += 2);
  const wStr = s => { for (let i=0;i<s.length;i++) dv.setUint8(o++, s.charCodeAt(i)); };

  wStr('RIFF'); wU32(36 + dataSize); wStr('WAVE');
  wStr('fmt '); wU32(16); wU16(1); wU16(numCh); wU32(sampleRate);
  wU32(sampleRate * blockAlign); wU16(blockAlign); wU16(16);
  wStr('data'); wU32(dataSize);

  const ch = Array.from({length:numCh}, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, ch[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      dv.setInt16(o, s | 0, true); o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
