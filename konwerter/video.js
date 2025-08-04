// video.js  – wersja odporna na brakujące eksporty

import * as ff from './ffmpeg-auto.js?v=5';   // query-string zabija cache modułu

// mapowanie z domyślnymi fallbackami
const convertToMp4  = ff.convertToMp4  || (async f => f.slice());
const convertToWebm = ff.convertToWebm || convertToMp4;
const convertToMov  = ff.convertToMov  || convertToMp4;
const convertToMkv  = ff.convertToMkv  || convertToMp4;

/**
 * Konwertuje plik wideo do zadanego formatu.
 * @param {File|Blob} file  wejściowy plik wideo
 * @param {string} fmt      docelowy format ('mp4','webm','mov','mkv')
 * @returns {Promise<Blob>}
 */
async function convertVideo(file, fmt) {
  const normalized = (fmt || '').replace(/-lite$/i, '').toLowerCase();
  const inputExt   = (file.name?.split('.').pop() || '').toLowerCase();

  // Jeśli format docelowy = źródłowy → kopiuj
  if (inputExt === normalized) return file.slice();

  try {
    switch (normalized) {
      case 'mp4':  return await convertToMp4(file);
      case 'webm': return await convertToWebm(file);
      case 'mov':  return await convertToMov(file);
      case 'mkv':  return await convertToMkv(file);
      default:
        console.warn(`Nieobsługiwany format "${fmt}" – zwracam oryginał`);
        return file.slice();
    }
  } catch (err) {
    console.error(`Konwersja do ${normalized} nie powiodła się:`, err);
    return file.slice();                // fallback = oryginał
  }
}

// eksporty
export { convertVideo };
export default convertVideo;
export const supportedVideoFormats = ['mp4', 'webm', 'mov', 'mkv'];
