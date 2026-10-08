// ABOUTME: The animation engine for a product demo scene: actors with entries and exits, captions, photo crops and sound cues.
// ABOUTME: Load it with a classic <script src> after the scene's <style> (file:// pages cannot load modules); the scene ends with film({...}).

/*
 * Time is in units of a twelfth of a second: 12 is one second, 24 two, and fractions are allowed.
 * Every frame is a pure function of time: renderFrame(t) sets every actor from t alone, so any moment can be
 * drawn in any order, and render.ts samples the timeline at 60 frames per second.
 */
const UNIT = 12;
const CUES = [];
const actors = [];
const updaters = [];
const FILM = { unit: UNIT, length: 0, poster: 0, music: null, look: "smooth" };

// The camera holds the stage; film() lays the paper grain and the vignette over both.
const camera = document.body.appendChild(
  Object.assign(document.createElement("div"), { id: "camera" }),
);
const stage = camera.appendChild(
  Object.assign(document.createElement("div"), { id: "stage" }),
);
document.body.insertAdjacentHTML(
  "afterbegin",
  `<svg width="0" height="0" style="position:absolute"><defs>
    <filter id="boil" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence class="boil-noise" type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="1"/>
      <feDisplacementMap in="SourceGraphic" scale="3.4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="boil-soft" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence class="boil-noise" type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="1"/>
      <feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs></svg>`,
);

const ease = {
  lin: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Overshoots by about a tenth and settles: the default entry, so things land instead of stopping.
  back: (t) => {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
const clamp01 = (t) => Math.max(0, Math.min(1, t));
/** 0 before a, 1 after b, eased in between. */
const progress = (t, a, b, e = "out") => ease[e](clamp01((t - a) / (b - a)));
/** A sound at time t; sound.ts knows tap, stamp, slide, whoosh, pop, tick, click and blink. */
const cue = (t, sound, gain = 1, pitch = 1) =>
  CUES.push({ f: t, s: sound, gain, pitch });
/** A function of t that runs on every frame, for anything an actor cannot express: counters, bars, line draws. */
const onFrame = (fn) => updaters.push(fn);

/** Builds one element from HTML and appends it to parent (the stage by default). */
function el(html, parent = stage) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return parent.appendChild(t.content.firstElementChild);
}

/**
 * An actor holds still at its CSS position between an entry and an optional exit. `from` and `to` are offsets from
 * that position: x, y in px, r in degrees, s (or sx, sy) as scale. `hold` sets the resting pose, e.g. { r: -2 }.
 * `land` and `leave` name the sounds of its arrival and its exit. `jit` scales the hand-placed wobble of the
 * stop-motion look and does nothing in the smooth one.
 */
function actor(
  node,
  {
    at,
    from = {},
    dur = 6,
    e = "back",
    out,
    to = {},
    outDur = 4,
    hold,
    land,
    leave,
    jit = 1,
  },
) {
  const a = {
    node,
    at,
    from,
    dur,
    e,
    out,
    to,
    outDur,
    hold,
    jit,
    id: actors.length + 1,
  };
  actors.push(a);
  if (land) cue(at + Math.max(1, dur - 2), land);
  if (leave && out != null) cue(out, leave);
  return a;
}

function mix(a, b, k) {
  const o = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const scale = key === "s" || key === "sx" || key === "sy";
    const va = a[key] ?? (scale ? (a.s ?? 1) : 0);
    const vb = b[key] ?? (scale ? (b.s ?? 1) : 0);
    o[key] = va + (vb - va) * k;
  }
  return o;
}

// Deterministic noise for the stop-motion look: the same drawing always gets the same wobble.
function rand(seed) {
  let x = (seed + 0x6d2b79f5) | 0;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function place(a, t, drawing) {
  // 'inherit', not 'visible': a visible child would show through a parent that has already left.
  const shown = t >= a.at && (a.out == null || t <= a.out + a.outDur);
  a.node.style.visibility = shown ? "inherit" : "hidden";
  if (!shown) return;
  const rest = { x: 0, y: 0, r: 0, s: 1, ...(a.hold || {}) };
  let p = mix(
    { x: 0, y: 0, r: 0, s: 1, ...a.from },
    rest,
    progress(t, a.at, a.at + a.dur, a.e),
  );
  if (a.out != null && t > a.out)
    p = mix(
      p,
      { ...rest, ...a.to },
      progress(t, a.out, a.out + a.outDur, "in"),
    );
  if (drawing != null) {
    p.x += (rand(a.id * 7919 + drawing * 31) - 0.5) * 1.6 * a.jit;
    p.y += (rand(a.id * 104729 + drawing * 17) - 0.5) * 1.6 * a.jit;
    p.r += (rand(a.id * 1299709 + drawing * 13) - 0.5) * 0.45 * a.jit;
  }
  a.node.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) scale(${p.sx ?? p.s}, ${p.sy ?? p.s})`;
}

/** Splits text into word spans inside container; *word* marks a highlighted word. Returns the spans. */
function words(container, text) {
  return text.split(" ").map((w) => {
    const span = document.createElement("span");
    span.className = "w" + (w.startsWith("*") ? " hl" : "");
    span.textContent = w.replace(/\*/g, "");
    span.style.visibility = "hidden";
    container.appendChild(span);
    return span;
  });
}

/** A caption on the left half: its words drop in one per unit from `at` and fly off upwards from `out`. */
function caption(text, top, at, out) {
  const box = el(`<div class="a caption"></div>`);
  box.style.top = top + "px";
  words(box, text).forEach((w, i) =>
    actor(w, {
      at: at + i,
      from: { y: -40, r: -6, s: 1.08 },
      dur: 3,
      out: out + Math.floor(i / 2),
      to: { y: -900, r: 8 },
      outDur: 4,
      jit: 0.6,
    }),
  );
  cue(at, "slide", 0.6);
  cue(out, "whoosh", 0.7);
  return box;
}

/**
 * Fills node with a square crop of an image: crop = { src, width, x, y, size }, where width is the image's natural
 * width and (x, y, size) the square in its pixels. dx, dy shift the crop inside the node.
 */
function photo(node, crop, dx = 0, dy = 0) {
  const scale = node.offsetWidth / crop.size;
  node.style.backgroundImage = `url(${crop.src})`;
  node.style.backgroundRepeat = "no-repeat";
  node.style.backgroundSize = `${crop.width * scale}px auto`;
  node.style.backgroundPosition = `${-crop.x * scale + dx}px ${-crop.y * scale + dy}px`;
}

/**
 * Ends the scene: length, poster and the music's end and chord in units; look 'smooth' (default) or 'stop-motion';
 * fonts as CSS font shorthands ('800 20px Brand') and image URLs to wait for; paper: false for a plain backdrop.
 */
function film({
  length,
  poster = 0,
  music = null,
  look = "smooth",
  fonts = [],
  images = [],
  paper = true,
}) {
  Object.assign(FILM, { length, poster, music, look });
  if (paper) {
    camera.insertAdjacentHTML(
      "beforeend",
      `<svg class="grain" width="1920" height="1080" style="opacity:0.55"><filter id="fibers">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="11"/>
        <feColorMatrix values="0 0 0 0 0.36  0 0 0 0 0.31  0 0 0 0 0.24  0 0 0 0.42 0"/></filter>
        <rect width="1920" height="1080" filter="url(#fibers)"/></svg>
      <svg class="grain" width="1920" height="1080" style="opacity:0.5"><filter id="blotches">
        <feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves="3" seed="4"/>
        <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.47  0 0 0 0 0.36  0 0 0 0.35 -0.08"/></filter>
        <rect width="1920" height="1080" filter="url(#blotches)"/></svg>
      <div class="vignette"></div>`,
    );
  }
  const boil = [...document.querySelectorAll(".boil-noise")];
  window.renderFrame = (t) => {
    // Stop motion holds each drawing for a twelfth of a second, wobbles it by hand and re-cuts the paper edges.
    const drawing = look === "stop-motion" ? Math.floor(t) : null;
    const time = drawing ?? t;
    if (drawing != null) {
      boil.forEach((n) => n.setAttribute("seed", String(1 + (drawing % 3))));
      camera.style.transform = `translate(${(rand(drawing * 977) - 0.5) * 2.2}px, ${(rand(drawing * 331) - 0.5) * 2.2}px)`;
    }
    actors.forEach((a) => place(a, time, drawing));
    updaters.forEach((u) => u(time));
  };
  const loaded = (src) =>
    new Promise((resolve, reject) =>
      Object.assign(new Image(), {
        onload: resolve,
        onerror: () => reject(new Error(`image ${src}`)),
        src,
      }),
    );
  window.ready = Promise.all([
    ...fonts.map((f) => document.fonts.load(f)),
    ...images.map(loaded),
  ]);
  window.FILM = FILM;
  window.CUES = CUES.sort((a, b) => a.f - b.f);
  // Open the scene with ?t=120 to look at one moment in a browser.
  window.ready.then(() =>
    window.renderFrame(
      Number(new URLSearchParams(location.search).get("t") ?? 0),
    ),
  );
}
