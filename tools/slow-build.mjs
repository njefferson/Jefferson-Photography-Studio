// A SLOW GRAPHICS BUILD, ON DEMAND, IN A BROWSER THAT BUILDS IN TWENTY MILLISECONDS.
//
// NOT A WALK — a helper the walks import (decision 071). The editor's picture
// code took 42 s to build the first time after a release on a PC through
// Direct3D, and 557 ms on an iPad; in this container it takes about twenty
// milliseconds, so nothing here can see what the reader saw unless the build is
// made slow on purpose. This does it from OUTSIDE the app, with
// `page.addInitScript`, so the app carries no hook for it and cannot behave
// differently because it is being watched.
//
// WHAT IT MODELS, and it is Chromium's behaviour read from its source rather
// than a guess (the 071 record's field notes): the link of a big program is
// handed to the driver and takes `delay` ms from `linkProgram`. With
// KHR_parallel_shader_compile, COMPLETION_STATUS_KHR answers without waiting —
// false until then, true after. EVERY other question about the program
// (LINK_STATUS, useProgram, getUniformLocation, getAttribLocation,
// getActiveUniform, the info log) makes the browser FINISH the link before it
// answers, so here each of them holds the page, busy, until `delay` has passed
// — which is exactly the freeze a page that asks too early would give a reader.
//
// Only programs with a shader longer than 20000 characters are slowed: that is
// the editor's own, and not the report's one-line probes.
//
// `window.__bw` records what happened, with times and a frame count, so a walk
// can say not just THAT the page was held but WHEN and by WHAT question:
//   frames      animation frames seen so far (counted from the first script)
//   linkAt      when the big program was linked, and `linkFrame` the frame
//   releasedAt  when the build first answered done (the poll said yes, or a
//               held question let go)
//   early       every held question: [what, at, frame]
//   said        every write to the start screen's preparing line: [text, at, frame]
//   ctx         the editor's own WebGL context, for a walk that takes it away

/** THE FAKE, as a function Playwright serialises into the page.
 *
 *  Takes `cfg`: `delay` (ms the link takes), `par` (whether the browser offers
 *  KHR_parallel_shader_compile — false models a browser that has no way to
 *  build without holding the page), and `fail` (the link fails, with a log the
 *  walk can look for in the report). Returns nothing; installs itself on
 *  WebGL2RenderingContext.prototype and `window.__bw` before any page script.
 *
 *  What callers rely on: it is passed to `page.addInitScript(slowBuild, cfg)`,
 *  so it must stay self-contained — it runs in the page and can close over
 *  nothing from this module. */
export function slowBuild(cfg) {
  const bw = (window.__bw = { frames: 0, linkAt: 0, linkFrame: -1, releasedAt: 0, early: [], said: [], ctx: null });
  const tick = () => { bw.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  const P = WebGL2RenderingContext.prototype;
  const orig = {};
  for (const m of ["shaderSource", "attachShader", "linkProgram", "getProgramParameter", "useProgram", "getUniformLocation", "getAttribLocation", "getActiveUniform", "getProgramInfoLog", "getExtension"]) orig[m] = P[m];
  const bigShaders = new WeakSet();
  const bigPrograms = new WeakMap();
  const PLANTED = "planted by the walk: the driver refused this program";

  P.shaderSource = function (s, src) { if (String(src).length > 20000) bigShaders.add(s); return orig.shaderSource.call(this, s, src); };
  P.attachShader = function (p, s) { if (bigShaders.has(s)) bigPrograms.set(p, { linkedAt: 0 }); return orig.attachShader.call(this, p, s); };
  P.linkProgram = function (p) {
    const r = orig.linkProgram.call(this, p);
    const e = bigPrograms.get(p);
    if (e) { e.linkedAt = performance.now(); bw.linkAt = e.linkedAt; bw.linkFrame = bw.frames; }
    return r;
  };
  const release = () => { if (!bw.releasedAt) bw.releasedAt = performance.now(); };
  /** A question that makes the browser finish the link: held until it is done. */
  const hold = (p, what) => {
    const e = p && bigPrograms.get(p);
    if (!e || !e.linkedAt) return;
    const until = e.linkedAt + cfg.delay;
    if (performance.now() < until) {
      bw.early.push([what, performance.now(), bw.frames]);
      while (performance.now() < until) { /* the page is held, as the reader's was */ }
    }
    release();
  };
  P.getProgramParameter = function (p, pname) {
    const e = p && bigPrograms.get(p);
    if (e && pname === 0x91b1) {
      const done = performance.now() >= e.linkedAt + cfg.delay;
      if (done) release();
      return done;
    }
    if (e) hold(p, `getProgramParameter(0x${pname.toString(16)})`);
    if (e && cfg.fail && pname === this.LINK_STATUS) return false;
    return orig.getProgramParameter.call(this, p, pname);
  };
  for (const m of ["useProgram", "getUniformLocation", "getAttribLocation", "getActiveUniform"]) {
    P[m] = function (p, ...rest) { hold(p, m); return orig[m].call(this, p, ...rest); };
  }
  P.getProgramInfoLog = function (p) {
    hold(p, "getProgramInfoLog");
    if (cfg.fail && bigPrograms.get(p)) return PLANTED;
    return orig.getProgramInfoLog.call(this, p);
  };
  P.getExtension = function (name) {
    if (name === "KHR_parallel_shader_compile") return cfg.par ? { COMPLETION_STATUS_KHR: 0x91b1, maxShaderCompilerThreadsKHR() {} } : null;
    return orig.getExtension.call(this, name);
  };

  // THE EDITOR'S OWN CONTEXT, so a walk can take the graphics away mid-build.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (type === "webgl2" && this.id === "view") bw.ctx = ctx;
    return ctx;
  };

  // EVERY WRITE TO THE PREPARING LINE, AT THE MOMENT IT IS MADE. A
  // MutationObserver reports after the task that made the change, and the
  // question here is whether the words went up BEFORE the link in that same
  // task — so the setter itself is watched.
  const text = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  Object.defineProperty(Node.prototype, "textContent", {
    configurable: true,
    get() { return text.get.call(this); },
    set(v) {
      if (this.id === "preparing") bw.said.push([String(v), performance.now(), bw.frames]);
      text.set.call(this, v);
    },
  });
}
