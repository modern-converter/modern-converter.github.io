// ffmpeg-auto.js  — wersja błyskawiczna (jedno źródło CDNJS)
// jeśli chcesz więcej CDN-ów i retry, rozbuduj tablicę LIB_URLS i pętlę importów.

let ffmpegInstance = null;
let fetchFileFn     = null;
let loaded          = false;

/* ────────────────────────────────────────────────────────────── */
/* 1. Jedyny (na razie) URL do biblioteki createFFmpeg/fetchFile */
const LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/index.js';

/* 2. Ścieżka do ffmpeg-core.js – możesz podać własny URL z serwera,
      zostawiłem CDNJS z tą samą wersją, żeby był kompletny zestaw */
const CORE_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/ffmpeg-core.js';

/* ────────────────────────────────────────────────────────────── */
export async function ensureFFmpeg({ log = false, timeoutMs = 25000 } = {}) {
  if (loaded && ffmpegInstance) return { ffmpeg: ffmpegInstance, fetchFile: fetchFileFn };

  // 1) Pobieramy bibliotekę z CDNJS (ESM, względne importy – NIE ma bare-specifierów)
  const { createFFmpeg, fetchFile } = await importWithTimeout(LIB_URL, timeoutMs);

  // 2) Tworzymy instancję z jedynym corePath
  const ffmpeg = createFFmpeg({ log, corePath: CORE_URL });
  await Promise.race([
    ffmpeg.load(),
    timeout(timeoutMs, 'FFmpeg load timeout'),
  ]);

  ffmpegInstance = ffmpeg;
  fetchFileFn    = fetchFile;
  loaded         = true;

  return { ffmpeg: ffmpegInstance, fetchFile: fetchFileFn };
}

/* ────────────────────────────────────────────────────────────── */
/* API konwersji – zostawiłem tylko MP4, WebM i WAV.
   Dodasz pozostałe w razie potrzeby. */
export const convertToMp4 = (file, { crf = 23, preset = 'medium', aBitrate = '160k' } = {}) =>
  exec(file, [
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-c:a', 'aac', '-b:a', aBitrate, '-movflags', '+faststart',
  ], 'out.mp4', 'video/mp4');

export const convertToWebm = (file, { crf = 30, aBitrate = '128k' } = {}) =>
  exec(file, [
    '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
    '-c:a', 'libopus', '-b:a', aBitrate,
  ], 'out.webm', 'video/webm');

export const extractToWav = (file, { sampleRate = 48000 } = {}) =>
  exec(file, [
    '-vn', '-acodec', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '2',
  ], 'out.wav', 'audio/wav');

/* ─────────────────── helpers ─────────────────── */
async function exec(file, args, outName, mime) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg();
  if (!ffmpeg) throw new Error('FFmpeg niedostępny – nie udało się załadować z CDN.');

  const inExt  = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const inName = `src.${inExt}`;

  ffmpeg.FS('writeFile', inName, await fetchFile(file));
  await ffmpeg.run('-i', inName, ...args, outName);
  const data = ffmpeg.FS('readFile', outName);

  try { ffmpeg.FS('unlink', inName); ffmpeg.FS('unlink', outName); } catch {}
  return new Blob([data.buffer], { type: mime });
}

const importWithTimeout = (url, ms) =>
  Promise.race([ import(/* @vite-ignore */ url), timeout(ms, `Import timeout ${url}`) ]);

const timeout = (ms, msg) =>
  new Promise((_, r) => setTimeout(() => r(new Error(msg)), ms));
