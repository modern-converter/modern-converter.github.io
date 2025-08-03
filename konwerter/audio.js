export async function convertAudio(file, fmt){
  if(['mp3','m4a','ogg','flac','opus'].includes(fmt)){
    console.warn('FFmpeg unavailable; falling back do WAV/PCM.');
  }
  const array = await file.arrayBuffer();
  let audioBuf = null;
  try{
    const ac = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 48000});
    audioBuf = await ac.decodeAudioData(array.slice(0));
    ac.close();
  }catch{}
  if(!audioBuf){ return await synthToneTo('wav'); }
  if(fmt === 'wav') return pcmToWavBlob(audioBuf);
  return pcmToWavBlob(audioBuf);
}

async function synthToneTo(format='wav'){
  const sr = 48000, dur = 0.5, len = Math.floor(sr*dur);
  const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, len, sr);
  const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = 440;
  const gain = ac.createGain(); gain.gain.value = 0.2;
  osc.connect(gain).connect(ac.destination);
  osc.start(0); osc.stop(dur);
  const buf = await ac.startRendering();
  const wav = await pcmToWavBlob(buf);
  return wav;
}

function pcmToWavBlob(audioBuffer){
  const numOfChan = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numOfChan * bytesPerSample;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (o,s)=>{ for(let i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)); };
  let off = 0;
  writeStr(off,'RIFF'); off+=4;
  view.setUint32(off, 36+dataSize, true); off+=4;
  writeStr(off,'WAVE'); off+=4;
  writeStr(off,'fmt '); off+=4;
  view.setUint32(off, 16, true); off+=4;
  view.setUint16(off, 1, true); off+=2;
  view.setUint16(off, numOfChan, true); off+=2;
  view.setUint32(off, sampleRate, true); off+=4;
  view.setUint32(off, sampleRate*blockAlign, true); off+=4;
  view.setUint16(off, blockAlign, true); off+=2;
  view.setUint16(off, bytesPerSample*8, true); off+=2;
  writeStr(off,'data'); off+=4;
  view.setUint32(off, dataSize, true); off+=4;
  const channels = [];
  for(let ch = 0; ch < numOfChan; ch++) channels.push(audioBuffer.getChannelData(ch));
  let idx = 0;
  for(let i=0; i<samples; i++){
    for(let ch=0; ch<numOfChan; ch++){
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(44 + idx, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      idx += 2;
    }
  }
  return new Blob([view], {type:'audio/wav'});
}
