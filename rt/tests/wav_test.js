// rt/wav.js — the reference clip's shape: rate, resampler, WAV bytes, data: URL, the gate's voice.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { REF_RATE, resample, referenceWav, wavDataUrl, mockVoice, envelope, decodeWav } from "../wav.js";

Deno.test("decodeWav: the encoder's own bytes come back within one LSB; junk is refused", () => {
  const take = mockVoice(0.3, 24000, 4);
  const { pcm, sr } = decodeWav(referenceWav(take, 24000));
  assertEquals(sr, REF_RATE);
  assertEquals(pcm.length, take.length);
  let worst = 0; for (let i = 0; i < pcm.length; i++) worst = Math.max(worst, Math.abs(pcm[i] - take[i]));
  assert(worst <= 1 / 32768 + 1e-6, "round-trip error " + worst);
  let threw = false; try { decodeWav(new Uint8Array(64)); } catch { threw = true; }
  assert(threw, "64 zero bytes are not a WAV");
});

Deno.test("envelope: n windows, loudest is 1, silence is all zero, a burst lands in its window", () => {
  const x = new Float32Array(4800);
  for (let i = 2400; i < 2500; i++) x[i] = 0.5;
  const e = envelope(x, 48);
  assertEquals(e.length, 48);
  assertEquals(e[24], 1, "the burst sits in window 24 of 48");
  assertEquals(e[0], 0);
  assert(envelope(new Float32Array(100), 8).every((v) => v === 0));
  assertEquals(envelope(new Float32Array(0), 8).length, 8);
});

const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216;
const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

Deno.test("resample: length scales with the rate, a constant stays constant, same rate is identity", () => {
  const x = new Float32Array(480).fill(0.5);
  const y = resample(x, 48000, 24000);
  assertEquals(y.length, 240);
  assert(y.every((v) => Math.abs(v - 0.5) < 1e-6), "a DC signal must survive interpolation");
  assert(resample(x, 24000, 24000) === x, "same rate returns the same array");
  assertEquals(resample(new Float32Array(0), 48000, 24000).length, 0);
  const ramp = Float32Array.from({ length: 100 }, (_, i) => i / 99);
  const r = resample(ramp, 44100, 24000);
  for (let i = 1; i < r.length; i++) assert(r[i] >= r[i - 1], "a ramp stays monotonic");
});

Deno.test("referenceWav: mono PCM16 at REF_RATE with a well-formed 44-byte header", () => {
  const take = mockVoice(0.5, 48000, 3);
  const b = referenceWav(take, 48000);
  assertEquals(tag(b, 0), "RIFF"); assertEquals(tag(b, 8), "WAVE"); assertEquals(tag(b, 36), "data");
  assertEquals(u16(b, 20), 1, "PCM"); assertEquals(u16(b, 22), 1, "mono"); assertEquals(u16(b, 34), 16, "16-bit");
  assertEquals(u32(b, 24), REF_RATE);
  assertEquals(u32(b, 40), b.length - 44);
  assertEquals(b.length - 44, Math.round(take.length / 2) * 2, "half the frames at half the rate, two bytes each");
});

Deno.test("wavDataUrl: the exact prefix the edge validates, and the bytes come back", () => {
  const b = referenceWav(mockVoice(0.1, 24000, 5), 24000);
  const url = wavDataUrl(b);
  assert(/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/.test(url), "the shape /feed/voice accepts");
  const back = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  assertEquals(back.length, b.length);
  assertEquals(tag(back, 0), "RIFF");
});

Deno.test("mockVoice: deterministic per seed, sized as asked, within the peak", () => {
  const a = mockVoice(1, 24000, 9), b = mockVoice(1, 24000, 9), c = mockVoice(1, 24000, 10);
  assertEquals(a.length, 24000);
  assert(a.every((v, i) => v === b[i]), "the same seed is the same take");
  assert(a.some((v, i) => v !== c[i]), "a different seed is a different take");
  let peak = 0; for (const v of a) peak = Math.max(peak, Math.abs(v));
  assert(peak <= 0.8 + 1e-6 && peak > 0.3, "peak " + peak);
});
