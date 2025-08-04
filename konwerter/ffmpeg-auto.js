// ffmpeg-auto.js
// Ładuje FFmpeg.wasm z CDN bez zależności od bundlera (bez bare module specifier).
let ffmpegInstance = null;
let fetchFileFn = null;
let loaded = false;
let loadingPromise = null;

/**
 * Upewnij się, że FFmpeg jest załadowany. Próbuje CDN-ów dla samej biblioteki i core.
 * @param {Object} options
 * @param {boolean} options.log
 * @param {string|string[]} options.corePath - URL lub lista URL-i do ffmpeg-core.js
 * @param {string|string[]} options.ffmpegPath - URL lub lista URL-i do skryptu @ffmpeg/ffmpeg (dist/ffmpeg.min.js)
 * @param {number} options.timeoutMs
 */
export async function ensureFFmpeg({
  log = false,
  corePath = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/ffmpeg-core.js',
    'https://unpkg.com/@ffmpeg/core@0.12.6/ffmpeg-core.js',
  ],
  ffmpegPath = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/ffmpeg.min.js',
    'https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/ffmpeg.min.js',
  ],
  timeoutMs = 25000,
} = {}) {
  if (loaded && ffmpegInstance && fetchFileFn) return { ffmpeg: ffmpegInstance, fetchFile: fetchFileFn };
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Upewnij się, że to tablice
    const corePaths = Array.isArray(corePath) ? corePath : [corePath];
    const ffmpegPaths = Array.isArray(ffmpegPath) ? ffmpegPath : [ffmpegPath];

    let lastErr = null;

    // Spróbuj załadować samą bibliotekę @ffmpeg/ffmpeg z jednego z CDN-ów
    let createFFmpeg, fetchFile;
    for (const libUrl of ffmpegPaths) {
      try {
        const module = await import(/* @vite-ignore */ libUrl);
        if (module && module.createFFmpeg && module.fetchFile) {
          createFFmpeg = module.createFFmpeg;
          fetchFile = module.fetchFile;
          break;
        } else {
          console.warn(`Załadowano moduł z ${libUrl}, ale brak createFFmpeg/fetchFile.`); 
        }
      } catch (e) {
        console.warn(`Nie udało się zaimportować FFmpeg z ${libUrl}:`, e);
        lastErr = e;
      }
    }
    if (!createFFmpeg || !fetchFile) {
      console.error('Żadne źródło @ffmpeg/ffmpeg nie zadziałało.', lastErr);
      loaded = false;
      return { ffmpeg: null, fetchFile: null };
    }

    // Teraz próba stworzenia instancji z różnymi corePath
    for (let attempt = 0; attempt < corePaths.length; attempt++) {
      const path = corePaths[attempt];
      try {
        const inst = createFFmpeg({
          log,
          corePath: path,
          progress: ({ ratio }) => {
            // Można nasłuchiwać przez eventy z zewnątrz, jeśli potrzeba
            // window.dispatchEvent(new CustomEvent('ffmpeg-progress', { detail: ratio }));
          },
        });

        // Timeout przy ładowaniu
        await Promise.race([
          inst.load(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`FFmpeg load timeout dla corePath ${path}`)), timeoutMs)
          ),
        ]);

        ffmpegInstance = inst;
        fetchFileFn = fetchFile;
        loaded = true;
        return { ffmpeg: ffmpegInstance, fetchFile: fetchFileFn };
      } catch (e) {
        console.warn(`Nie udało się załadować FFmpeg.wasm z ${path}:`, e);
        lastErr = e;
        // backoff przed kolejną próbą
        if (attempt < corePaths.length - 1) {
          await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }

    // Wszystkie próby zawiodły
    console.error('Nie udało się załadować żadnej instancji FFmpeg.wasm:', lastErr);
    loaded = false;
    ffmpegInstance = null;
    fetchFileFn = null;
    return { ffmpeg: null, fetchFile: null };
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

// Wspólna funkcja uruchamiająca FFmpeg
async function runFFmpeg(inst, fetchFile, file, args, outName, mime) {
  const inputExt = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const inName = `input.${inputExt}`;

  try {
    inst.FS('writeFile', inName, await fetchFile(file));
  } catch (e) {
    throw new Error(`Nie udało się zapisać pliku wejściowego do FS: ${e.message}`);
  }

  try {
    await inst.run(...['-i', inName, ...args, outName]);
  } catch (e) {
    // sprzątaj wejście przy błędzie
    try { inst.FS('unlink', inName); } catch {}
    throw new Error(`Błąd podczas wykonywania FFmpeg: ${e.message}`);
  }

  let data;
  try {
    data = inst.FS('readFile', outName);
  } catch (e) {
    throw new Error(`Nie udało się odczytać pliku wyjściowego: ${e.message}`);
  }

  // czyszczenie
  try { inst.FS('unlink', inName); } catch {}
  try { inst.FS('unlink', outName); } catch {}

  return new Blob([data.buffer], { type: mime });
}

// API konwersji
export async function convertMp4ToMp3(file, { bitrate = '192k', ffmpegOpts } = {}) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg(ffmpegOpts);
  if (!ffmpeg) return await extractAudioFallback(file, 'wav');
  try {
    return await runFFmpeg(
      ffmpeg,
      fetchFile,
      file,
      ['-vn', '-b:a', bitrate, '-f', 'mp3'],
      'out.mp3',
      'audio/mpeg'
    );
  } catch (e) {
    console.warn('Konwersja do MP3 nie powiodła się, fallback do WAV:', e);
    return extractAudioFallback(file, 'wav');
  }
}

export async function convertToMp4(file, { crf = 23, preset = 'medium', aBitrate = '160k', ffmpegOpts } = {}) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg(ffmpegOpts);
  if (!ffmpeg) throw new Error('FFmpeg nie dostępny (CDN) i brak fallbacku do MP4.');
  return runFFmpeg(
    ffmpeg,
    fetchFile,
    file,
    ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-c:a', 'aac', '-b:a', aBitrate, '-movflags', '+faststart'],
    'out.mp4',
    'video/mp4'
  );
}

export async function convertToMov(file, { crf = 23, preset = 'medium', aBitrate = '160k', ffmpegOpts } = {}) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg(ffmpegOpts);
  if (!ffmpeg) throw new Error('FFmpeg nie dostępny (CDN).');
  return runFFmpeg(
    ffmpeg,
    fetchFile,
    file,
    ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-c:a', 'aac', '-b:a', aBitrate],
    'out.mov',
    'video/quicktime'
  );
}

export async function convertToWebm(file, { crf = 30, aBitrate = '128k', ffmpegOpts } = {}) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg(ffmpegOpts);
  if (!ffmpeg) throw new Error('FFmpeg nie dostępny (CDN).');
  return runFFmpeg(
    ffmpeg,
    fetchFile,
    file,
    ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-c:a', 'libopus', '-b:a', aBitrate],
    'out.webm',
    'video/webm'
  );
}

export async function convertToMkv(file, { crf = 23, preset = 'medium', aBitrate = '160k', ffmpegOpts } = {}) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg(ffmpegOpts);
  if (!ffmpeg) throw new Error('FFmpeg nie dostępny (CDN).');
  return runFFmpeg(
    ffmpeg,
    fetchFile,
    file,
    ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-c:a', 'aac', '-b:a', aBitrate],
    'out.mkv',
    'video/x-matroska'
  );
}

export async function extractToWav(file, { sampleRate = 48000, ffmpegOpts } = {}) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg(ffmpegOpts);
  if (!ffmpeg) return await extractAudioFallback(file, 'wav');
  return runFFmpeg(
    ffmpeg,
    fetchFile,
    file,
    ['-vn', '-acodec', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '2'],
    'out.wav',
    'audio/wav'
  );
}

// Fallback bez FFmpeg – tylko WAV/WEBM
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
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  const chunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  const rec = new MediaRecorder(dest.stream, {
    mimeType: mime,
    audioBitsPerSecond: 128000,
  });
  await new Promise(resolve => {
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
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
  const wU32 = v => {
    dv.setUint32(o, v, true);
    o += 4;
  };
  const wU16 = v => {
    dv.setUint16(o, v, true);
    o += 2;
  };
  const wStr = s => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i));
  };

  wStr('RIFF');
  wU32(36 + dataSize);
  wStr('WAVE');
  wStr('fmt ');
  wU32(16);
  wU16(1);
  wU16(numCh);
  wU32(sampleRate);
  wU32(sampleRate * blockAlign);
  wU16(blockAlign);
  wU16(16);
  wStr('data');
  wU32(dataSize);

  const ch = Array.from({ length: numCh }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, ch[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      dv.setInt16(o, s | 0, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
