// ABOUTME: Synthesizes a demo video's soundtrack: a marimba and bass bed plus paper sound effects on the scene's cues.
// ABOUTME: Pure arithmetic with a seeded noise source, so the same cues always give the same 16-bit mono WAV.

export type Cue = { f: number; s: string; gain: number; pitch: number };

const RATE = 44100;

function noise(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** A band-pass biquad (constant 0 dB peak gain), for paper rustle and slides. */
function bandpass(centre: number, q: number) {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number, f = centre) => {
    const w = (2 * Math.PI * f) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const y =
      (alpha * x - alpha * x2 - -2 * Math.cos(w) * y1 - (1 - alpha) * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

function add(
  out: Float32Array,
  start: number,
  length: number,
  sample: (t: number) => number,
) {
  const s0 = Math.round(start * RATE);
  for (let i = 0; i < length * RATE && s0 + i < out.length; i++)
    if (s0 + i >= 0) out[s0 + i] += sample(i / RATE);
}

const sfx: Record<
  string,
  (
    out: Float32Array,
    at: number,
    gain: number,
    pitch: number,
    seed: number,
  ) => void
> = {
  tap(out, at, gain, pitch, seed) {
    const n = noise(seed);
    const bp = bandpass(1800 * pitch, 1.2);
    add(
      out,
      at,
      0.09,
      (t) =>
        gain *
        (0.5 * bp(n()) * Math.exp(-t * 70) +
          0.6 * Math.sin(2 * Math.PI * 130 * pitch * t) * Math.exp(-t * 45)),
    );
  },
  stamp(out, at, gain, pitch, seed) {
    const n = noise(seed);
    const bp = bandpass(900, 0.9);
    add(
      out,
      at,
      0.25,
      (t) =>
        gain *
        (0.6 * bp(n()) * Math.exp(-t * 28) +
          0.9 *
            Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-t * 40)) * pitch * t) *
            Math.exp(-t * 18)),
    );
  },
  slide(out, at, gain, _pitch, seed) {
    const n = noise(seed);
    const bp = bandpass(2500, 0.8);
    const len = 0.26;
    add(
      out,
      at,
      len,
      (t) =>
        gain *
        0.45 *
        bp(n(), 1400 + 2600 * (t / len)) *
        Math.sin(Math.PI * (t / len)) ** 1.5,
    );
  },
  whoosh(out, at, gain, _pitch, seed) {
    const n = noise(seed);
    const bp = bandpass(1500, 0.7);
    const len = 0.42;
    add(
      out,
      at,
      len,
      (t) =>
        gain *
        0.55 *
        bp(n(), 3200 - 2400 * (t / len)) *
        Math.sin(Math.PI * (t / len)) ** 2,
    );
  },
  pop(out, at, gain, pitch) {
    add(
      out,
      at,
      0.12,
      (t) =>
        gain *
        0.5 *
        Math.sin(
          2 * Math.PI * 620 * pitch * t * (1 + 0.6 * Math.exp(-t * 60)),
        ) *
        Math.exp(-t * 32),
    );
  },
  tick(out, at, gain, pitch, seed) {
    const n = noise(seed);
    add(
      out,
      at,
      0.04,
      (t) =>
        gain *
        (0.35 * Math.sin(2 * Math.PI * 2100 * pitch * t) + 0.2 * n()) *
        Math.exp(-t * 160),
    );
  },
  click(out, at, gain, pitch, seed) {
    sfx.tick(out, at, gain * 1.2, pitch * 0.8, seed);
    sfx.tick(out, at + 0.07, gain, pitch * 0.7, seed + 1);
  },
  blink(out, at, gain) {
    add(
      out,
      at,
      0.14,
      (t) =>
        gain *
        0.32 *
        Math.sin(2 * Math.PI * (480 + 520 * Math.exp(-t * 30)) * t) *
        Math.exp(-t * 22),
    );
  },
};

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** A marimba-like note: the fundamental plus its fourth harmonic, which decays faster. */
function marimba(
  out: Float32Array,
  at: number,
  note: number,
  gain: number,
  length = 0.9,
) {
  const f = midi(note);
  add(
    out,
    at,
    length,
    (t) =>
      gain *
      (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6) +
        0.25 * Math.sin(2 * Math.PI * 4 * f * t) * Math.exp(-t * 26)) *
      Math.min(1, t * 400),
  );
}

function bass(
  out: Float32Array,
  at: number,
  note: number,
  gain: number,
  length: number,
) {
  const f = midi(note);
  add(
    out,
    at,
    length,
    (t) =>
      gain *
      Math.tanh(1.6 * Math.sin(2 * Math.PI * f * t)) *
      Math.exp(-t * 1.8) *
      Math.min(1, t * 200),
  );
}

/** The bed: 100 bpm, Fmaj7 Am7 Dm7 Bbmaj7 in eighth-note arpeggios until endAt, then one chord at chordAt if given. */
function music(out: Float32Array, endAt: number, chordAt?: number) {
  const beat = 60 / 100;
  const chords = [
    [41, [65, 69, 72, 76]],
    [45, [64, 67, 69, 72]],
    [38, [62, 65, 69, 72]],
    [46, [62, 65, 69, 70]],
  ] as const;
  const order = [0, 1, 2, 3, 2, 1, 3, 2];
  const shaker = noise(99);
  const hp = bandpass(7000, 0.7);
  for (let bar = 0; bar * 4 * beat < endAt; bar++) {
    const [root, tones] = chords[bar % 4];
    const t0 = bar * 4 * beat;
    bass(out, t0, root, 0.16, 4 * beat);
    order.forEach((k, step) => {
      const at = t0 + (step * beat) / 2;
      if (at < endAt) marimba(out, at, tones[k], step % 2 ? 0.07 : 0.1);
    });
    for (let s = 0; s < 16; s++) {
      const at = t0 + (s * beat) / 4;
      if (at < endAt)
        add(
          out,
          at,
          0.05,
          (t) =>
            (s % 4 === 2 ? 0.05 : 0.025) * hp(shaker()) * Math.exp(-t * 90),
        );
    }
  }
  if (chordAt == null) return;
  bass(out, chordAt, 41, 0.22, 3.5);
  [53, 60, 65, 69, 72, 76, 79].forEach((note, i) =>
    marimba(out, chordAt + i * 0.035, note, 0.09, 3),
  );
}

/** A 16-bit mono WAV of the cues and, if bed is given, the music until bed.end and a chord at bed.chord; times in units. */
export function soundtrack(
  cues: Cue[],
  unit: number,
  length: number,
  bed?: { end: number; chord?: number } | null,
): Buffer {
  const seconds = length / unit + 0.6;
  const out = new Float32Array(Math.ceil(seconds * RATE));
  if (bed)
    music(
      out,
      bed.end / unit,
      bed.chord == null ? undefined : bed.chord / unit,
    );
  cues.forEach((c, i) => {
    if (!sfx[c.s]) throw new Error(`unknown sound "${c.s}" at ${c.f}`);
    sfx[c.s](out, c.f / unit, c.gain, c.pitch, 1000 + i * 17);
  });

  // Soft clip, normalise to -1 dBFS, fade the last half second.
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.tanh(out[i] * 1.2);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const norm = peak ? 0.89 / peak : 1;
  const fade = 0.5 * RATE;
  const data = Buffer.alloc(out.length * 2);
  for (let i = 0; i < out.length; i++) {
    const tail = Math.min(1, (out.length - i) / fade);
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, out[i] * norm * tail)) * 32767),
      i * 2,
    );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
