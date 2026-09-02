// rt/wav.js — a reference clip the voice pool can read. The phone records webm/opus (MediaRecorder), decodes
// it (decodeAudioData), conditions it (grain.js conditionSample) and sends mono PCM16 WAV — `audio/wav` is
// first in OmniVoice's accept list and needs no codec on the GPU box. The encoder is grain.js's; this file
// adds the rate, the resampler, the data: URL and the gate's voice-shaped take.
import { encodeWav } from "./grain.js";

/** 24 kHz — half the body of a 48 kHz take with nothing a clone can hear (the model resamples anyway). */
export const REF_RATE = 24000;

/** Linear-interpolation resample of a mono Float32Array; the same array back when the rates match. */
export function resample(x, from, to) {
  if (!x.length || from === to) return x;
  const n = Math.max(1, Math.round(x.length * to / from)), out = new Float32Array(n), k = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * k, j = Math.min(x.length - 1, Math.floor(p)), f = p - j, a = x[j], b = x[Math.min(x.length - 1, j + 1)];
    out[i] = a + (b - a) * f;
  }
  return out;
}

/** Mono PCM16 WAV bytes at {@link REF_RATE} from a conditioned take at any rate. */
export const referenceWav = (pcm, sr) => encodeWav([resample(pcm, sr, REF_RATE)], REF_RATE);

/** The inverse for a PCM WAV (8/16-bit, any channel count → mono): `{ pcm, sr }`; throws on anything else. */
export function decodeWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV");
  let o = 12, fmt = null, data = null;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), len = v.getUint32(o + 4, true);
    if (id === "fmt ") fmt = { code: v.getUint16(o + 8, true), ch: v.getUint16(o + 10, true), sr: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === "data") { data = { at: o + 8, len: Math.min(len, v.byteLength - o - 8) }; break; }
    o += 8 + len + (len & 1);
  }
  if (!fmt || !data || fmt.code !== 1 || (fmt.bits !== 16 && fmt.bits !== 8)) throw new Error("not PCM 8/16-bit WAV");
  const bps = fmt.bits / 8, frames = Math.floor(data.len / (fmt.ch * bps)), pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) { const p = data.at + (i * fmt.ch + c) * bps; s += bps === 2 ? v.getInt16(p, true) / 32768 : (v.getUint8(p) - 128) / 128; }
    pcm[i] = s / fmt.ch;
  }
  return { pcm, sr: fmt.sr };
}

/** `data:audio/wav;base64,…` from WAV bytes (chunked btoa — a 20 s clip is ~1 MB). */
export function wavDataUrl(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return "data:audio/wav;base64," + btoa(s);
}

/** `n` RMS windows over a take, normalised so the loudest is 1 — the ring's "seal" of a voice. */
export function envelope(pcm, n = 48) {
  const out = new Float32Array(n);
  if (!pcm.length) return out;
  const w = pcm.length / n; let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * w), b = Math.max(a + 1, Math.floor((i + 1) * w)); let s = 0;
    for (let j = a; j < b; j++) s += pcm[j] * pcm[j];
    out[i] = Math.sqrt(s / (b - a)); if (out[i] > peak) peak = out[i];
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}

// A voice-shaped take for the gate (headless Chromium has no microphone) and the mock echo: a low fundamental
// under a harmonic stack, a 5.5 Hz vibrato and a syllable-like envelope. Deterministic per seed, peak 0.8.
/** A synthetic "voice" of `seconds` at `sr`, deterministic per `seed`. */
export function mockVoice(seconds = 2, sr = REF_RATE, seed = 1) {
  const n = Math.round(seconds * sr), out = new Float32Array(n);
  let h = (seed * 2654435761) >>> 0; const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const f0 = 110 + rnd() * 60, syll = 3 + Math.floor(rnd() * 3), spd = 4 + rnd() * 2;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = f0 * (1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * t)), ph = 2 * Math.PI * f * t;
    const s = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.33 * Math.sin(3 * ph) + 0.18 * Math.sin(5 * ph);
    const env = Math.sin(Math.PI * Math.min(1, t / seconds)) * (0.6 + 0.4 * Math.abs(Math.sin(Math.PI * spd * t * syll / 4)));
    out[i] = 0.8 * env * s / 2.01;
  }
  return out;
}
