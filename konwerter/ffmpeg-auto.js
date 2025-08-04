// ffmpeg-auto.js
// Ładowanie FFmpeg.wasm w czystej przeglądarce (bez bundlera). 2025-08-04
// © MIT

let instance = null;
let fetchFile = null;
let _loaded = false;
let promise = null;

const CDN_LIBS = [
  // ESM-gotowiec
  'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js',
  'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js',
  'https://esm.sh/@ffmpeg/ffmpeg@0.12.15',
];

const CDN_CORES = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/umd/ffmpeg-core.js',
  'https://unpkg.com/@ffmpeg/core@0.12.15/dist/umd/ffmpeg-core.js',
];

export async function ensureFFmpeg({
  log = false,
  ffmpegLibs = CDN_LIBS,
  corePath = CDN_CORES,
  timeoutMs = 25_000,
} = {}) {
  if (_loaded && instance) return { ffmpeg: instance, fetchFile };

  if (promise) return promise;

  promise = (async () => {
    // 1) Pobierz bibliotekę createFFmpeg/fetchFile
    let createFFmpeg, _fetch;
    let lastErr = null;

    for (const url of ffmpegLibs) {
      try {
        const mod = await importModule(url, timeoutMs);
        if (mod?.createFFmpeg && mod?.fetchFile) {
          createFFmpeg = mod.createFFmpeg;
          _fetch = mod.fetchFile;
          break;
        }
      } catch (err) {
        console.warn(`Import z ${url} nieudany:`, err);
        lastErr = err;
      }
    }
    if (!createFFmpeg) {
      console.error('Nie udało się załadować żadnej wersji @ffmpeg/ffmpeg.', lastErr);
      return { ffmpeg: null, fetchFile: null };
    }

    // 2) Utwórz instancję z dowolnym działającym corePath
    const cores = Array.isArray(corePath) ? corePath : [corePath];
    for (let i = 0; i < cores.length; i++) {
      const coreURL = cores[i];
      try {
        const ffmpeg = createFFmpeg({
          log,
          corePath: coreURL,
          progress: ({ ratio }) =>
            window.dispatchEvent(new CustomEvent('ffmpeg-progress', { detail: ratio })),
        });

        await Promise.race([
          ffmpeg.load(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), timeoutMs)),
        ]);

        instance = ffmpeg;
        fetchFile = _fetch;
        _loaded = true;
        return { ffmpeg: instance, fetchFile };
      } catch (err) {
        console.warn(`FFmpeg core z ${coreURL} nie zadziałał:`, err);
        lastErr = err;
      }
    }

    console.error('Żaden ffmpeg-core nie zadziałał.', lastErr);
    return { ffmpeg: null, fetchFile: null };
  })();

  return promise;
}

// ---------------- util ----------------

async function importModule(url, timeout) {
  return Promise.race([
    import(/* @vite-ignore */ url),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`Timeout importu ${url}`)), timeout))
  ]);
}

function mimeByExt(ext) {
  return ({
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    gif: 'image/gif',
  })[ext] || 'application/octet-stream';
}

async function execFFmpeg(file, args, outName, mime) {
  const inExt = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const inName = `in.${inExt}`;
  const { ffmpeg, fetchFile } = await ensureFFmpeg();
  if (!ffmpeg) throw new Error('FFmpeg niedostępny (wszystkie CDN-y padły)');

  ffmpeg.FS('writeFile', inName, await fetchFile(file));
  await ffmpeg.run('-i', inName, ...args, outName);
  const data = ffmpeg.FS('readFile', outName);
  try { ffmpeg.FS('unlink', inName); } catch {}
  try { ffmpeg.FS('unlink', outName); } catch {}
  return new Blob([data.buffer], { type: mime });
}

// -------------- API konwersji (bez zmian dla reszty kodu) --------------

export const convertToMp4 = (file, opts = {}) =>
  execFFmpeg(
    file,
    ['-c:v', 'libx264', '-preset', opts.preset || 'medium',
     '-crf', String(opts.crf ?? 23),
     '-c:a', 'aac', '-b:a', opts.aBitrate || '160k', '-movflags', '+faststart'],
    'out.mp4',
    'video/mp4');

export const convertToWebm = (file, opts = {}) =>
  execFFmpeg(
    file,
    ['-c:v', 'libvpx-vp9', '-crf', String(opts.crf ?? 30),
     '-b:v', '0', '-c:a', 'libopus', '-b:a', opts.aBitrate || '128k'],
    'out.webm',
    'video/webm');

export const convertToMov = (file, opts = {}) =>
  execFFmpeg(
    file,
    ['-c:v', 'libx264', '-preset', opts.preset || 'medium',
     '-crf', String(opts.crf ?? 23),
     '-c:a', 'aac', '-b:a', opts.aBitrate || '160k'],
    'out.mov',
    'video/quicktime');

export const convertToMkv = (file, opts = {}) =>
  execFFmpeg(
    file,
    ['-c:v', 'libx264', '-preset', opts.preset || 'medium',
     '-crf', String(opts.crf ?? 23),
     '-c:a', 'aac', '-b:a', opts.aBitrate || '160k'],
    'out.mkv',
    'video/x-matroska');

export const convertMp4ToMp3 = (file, opts = {}) =>
  execFFmpeg(file, ['-vn', '-b:a', opts.bitrate || '192k', '-f', 'mp3'], 'out.mp3', 'audio/mpeg');

export const extractToWav = (file, opts = {}) =>
  execFFmpeg(file,
    ['-vn', '-acodec', 'pcm_s16le', '-ar', String(opts.sampleRate ?? 48_000), '-ac', '2'],
    'out.wav',
    'audio/wav');
