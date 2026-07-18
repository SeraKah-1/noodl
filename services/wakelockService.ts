/**
 * ==========================================
 * WAKELOCK SERVICE
 * ==========================================
 * Mencegah perangkat masuk ke mode tidur (sleep) saat kuis aktif.
 * Meniru implementasi solid dari Cognitive Sandbox:
 * 1. Screen Wake Lock (API browser modern)
 * 2. Background Audio Wake Lock (Audio hening untuk background keep-alive)
 * 3. Web Audio API Wake Lock (Alternatif frekuensi rendah)
 */

let wakeLock: any = null;
let audioWakeLock: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let silenceNode: OscillatorNode | null = null;
let isRunning = false;

function generateSilentWav(): string {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const duration = 1; // 1 second
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = duration * byteRate;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + dataSize, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, byteRate, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitsPerSample, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, dataSize, true);

  // Write silent samples (PCM 8-bit unsigned, silence is 128)
  for (let i = 0; i < dataSize; i++) {
    view.setUint8(44 + i, 128);
  }
  
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function requestWakeLock() {
  if (typeof window === 'undefined') return;

  // 1. Screen Wake Lock (prevents display sleep, works when page is visible)
  if ('wakeLock' in navigator && document.visibilityState === 'visible') {
    try {
      if (!wakeLock) {
        wakeLock = await (navigator as any).wakeLock.request('screen');
        console.log('[Wakelock] Screen Wake Lock active');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
          console.log('[Wakelock] Screen Wake Lock released');
        });
      }
    } catch (err: any) {
      console.warn(`[Wakelock] Screen Wake Lock error: ${err.name}, ${err.message}`);
    }
  }

  // 2. Audio Wake Lock (Background keep-alive, plays whether visible or hidden)
  try {
    if (!audioWakeLock) {
      const silentUrl = generateSilentWav();
      audioWakeLock = new Audio(silentUrl);
      audioWakeLock.loop = true;
    }
    if (audioWakeLock.paused) {
      await audioWakeLock.play();
      console.log('[Wakelock] Background Audio Wake Lock active');
    }
  } catch (err: any) {
    console.warn(`[Wakelock] Background Audio Wake Lock error: ${err.name}, ${err.message}`);
  }

  // 3. Web Audio API Wake Lock fallback
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      if (!silenceNode) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.0000001; // extremely quiet sound to prevent optimization bypass
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        silenceNode = osc;
        console.log('[Wakelock] Web Audio Wake Lock active');
      }
    }
  } catch (err: any) {
    console.warn(`[Wakelock] Web Audio Wake Lock error: ${err.name}, ${err.message}`);
  }
}

export function releaseWakeLock() {
  // Release Screen Wake Lock
  if (wakeLock !== null) {
    try {
      wakeLock.release();
    } catch (e) {}
    wakeLock = null;
  }
  
  // Release Audio Wake Lock
  if (audioWakeLock) {
    try {
      audioWakeLock.pause();
      console.log('[Wakelock] Background Audio Wake Lock released');
    } catch (e) {}
  }

  // Release Web Audio Wake Lock
  if (silenceNode) {
    try {
      silenceNode.stop();
    } catch (e) {}
    silenceNode = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      audioCtx.suspend();
    } catch (e) {}
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (isRunning && document.visibilityState === 'visible') {
      await requestWakeLock();
    }
  });
}

export function setWakelockRunning(v: boolean) { 
  isRunning = v; 
  if (v) {
    requestWakeLock();
  } else {
    releaseWakeLock();
  }
}
