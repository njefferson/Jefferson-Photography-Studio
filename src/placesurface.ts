// The sample surface of the test page: the circle a person places on the drawn photograph to mark a region, moved by a tap, a drag, the arrow keys or four buttons, sized by a slider and two buttons, named from a row of buttons or a typed name, confirmed or cancelled, with a magnified view of what lies under the marker and a list of the kept samples. It is a module of the test page's Separation check and of nothing in the editor.
//
// It builds its own elements inside the host it is given and changes nothing outside the host; the overlay that carries the rings lies over the photograph's canvas and the magnified view stands fixed in the window, both created inside the host's root element. It keeps nothing on the device and asks the network for nothing: the page keeps the samples it is handed back (record 109). The geometry is in exported functions of their own, so it can be proved with no browser.

import "./placesurface.css";
import type { PlaceSample } from "./placesamples";

/** The canvas's box on the screen, in the window's pixels: left and top of its corner, and its width and height as shown. */
export interface PlaceBox { left: number; top: number; width: number; height: number }

/** What the surface is started from: samples, the kept samples to show; names, the names offered as buttons; onChange, called with a copy of the kept samples at every confirm and every removal. */
export interface PlaceSurfaceOptions { samples: PlaceSample[]; names: string[]; onChange: (samples: PlaceSample[]) => void }

/** What the surface gives back: samples, a copy of the kept samples as they stand; set, to replace the kept samples without calling onChange; destroy, to take the surface's elements and listeners away. */
export interface PlaceSurface { readonly samples: PlaceSample[]; set(samples: PlaceSample[]): void; destroy(): void }

/** The magnified view's source rectangle in the canvas's own pixels, its zoom, and where the sample's centre and radius fall in the view's own 144 pixels. */
export interface PlaceViewSource { sx: number; sy: number; sw: number; sh: number; zoom: number; mx: number; my: number; mr: number }

/** The size slider's last position; position p gives the radius 0.01 times 2 to the power p over 8, so 32 gives 0.16. */
export const PLACE_SIZE_MAX = 32;
/** The size slider's start, 0.04 of the frame's shorter side. */
export const PLACE_SIZE_START = 16;
/** The magnified view's side in the window's pixels. */
export const PLACE_VIEW = 144;
/** How many of the view's pixels the sample's diameter spans before the zoom is held to its bounds. */
export const PLACE_VIEW_SPAN = 96;
/** The clear space between the marker's ring and the magnified view, in pixels. */
export const PLACE_VIEW_GAP = 16;
/** The least distance the magnified view's lower edge stands above the point of contact after a touch, in pixels. */
export const PLACE_VIEW_ABOVE = 60;
/** The most samples the surface keeps. */
export const PLACE_SAMPLES_MAX = 64;
/** The longest name a sample may take, in characters. */
export const PLACE_NAME_MAX = 40;
/** The name the report gives to the pixels no sample holds; a sample may not take it. */
const REST = "rest";

/** Takes v, a number, and lo and hi, its bounds. Returns v held between them; a value that is not a number gives lo. */
function hold(v: number, lo: number, hi: number): number {
  if (!(v === v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Takes px and py, a point in the window's pixels, and box, the canvas's box on the screen. Returns {x, y}: the point as fractions of the frame's width and height, not held to the frame; a box with no width or height gives {x: 0, y: 0}. The inverse of placeSurfaceFromFrame, consumed by the pointer handlers. */
export function placeSurfaceToFrame(px: number, py: number, box: PlaceBox): { x: number; y: number } {
  if (!(box.width > 0) || !(box.height > 0)) return { x: 0, y: 0 };
  return { x: (px - box.left) / box.width, y: (py - box.top) / box.height };
}

/** Takes x and y, fractions of the frame's width and height, and box, the canvas's box on the screen. Returns {px, py}: the point in the window's pixels. The inverse of placeSurfaceToFrame, consumed by the drawing of the rings and the placing of the magnified view. */
export function placeSurfaceFromFrame(x: number, y: number, box: PlaceBox): { px: number; py: number } {
  return { px: box.left + x * box.width, py: box.top + y * box.height };
}

/** Takes x and y, a centre as fractions of the frame's width and height. Returns {x, y} held inside the frame, each between 0 and 1; a figure that is not a number becomes a half. The marker's centre always satisfies this, so no sample is kept with its centre outside the frame. */
export function placeSurfaceClamp(x: number, y: number): { x: number; y: number } {
  return { x: hold(x === x ? x : 0.5, 0, 1), y: hold(y === y ? y : 0.5, 0, 1) };
}

/** Takes x and y, the centre as fractions; r, the radius as a fraction of the frame's shorter side; dir, left, right, up or down; whole, true to move by the whole radius and false by a quarter of it; width and height, the frame's shown size. Returns {x, y}: the centre moved by that step in pixels turned into fractions and held inside the frame, so a step toward an edge the centre already stands on leaves it where it is. Consumed by the arrow keys and the four buttons. */
export function placeSurfaceStep(x: number, y: number, r: number, dir: "left" | "right" | "up" | "down", whole: boolean, width: number, height: number): { x: number; y: number } {
  const short = Math.min(width, height);
  const amount = (whole ? r : r / 4) * short;
  const fx = width > 0 ? amount / width : 0;
  const fy = height > 0 ? amount / height : 0;
  let nx = x, ny = y;
  if (dir === "left") nx = x - fx;
  else if (dir === "right") nx = x + fx;
  else if (dir === "up") ny = y - fy;
  else ny = y + fy;
  return placeSurfaceClamp(nx, ny);
}

/** Takes position, a size position from 0 to 32. Returns the radius as a fraction of the frame's shorter side, 0.01 times 2 to the power position over 8; a position outside 0 to 32 is held to it. Position 16 gives 0.04 and 32 gives 0.16. */
export function placeSurfaceRadius(position: number): number {
  return 0.01 * Math.pow(2, hold(position, 0, PLACE_SIZE_MAX) / 8);
}

/** Takes position, a size position, and delta, the change in positions. Returns the whole position that results, held from 0 to 32, so the size stops at each bound. */
export function placeSurfaceSizeMove(position: number, delta: number): number {
  return hold(Math.round(position + delta), 0, PLACE_SIZE_MAX);
}

/** Takes r, a radius as a fraction of the frame's shorter side. Returns the nearest size position from 0 to 32; a radius that is not above 0 gives 0. The inverse of placeSurfaceRadius, consumed where a kept sample is shown back on the slider. */
export function placeSurfaceSizeOf(r: number): number {
  if (!(r > 0)) return 0;
  return hold(Math.round(8 * Math.log(r / 0.01) / Math.LN2), 0, PLACE_SIZE_MAX);
}

/** Takes x and y, the sample's centre as fractions; r, its radius as a fraction of the frame's shorter side; cw and ch, the canvas's own size in pixels; boxWidth and boxHeight, the canvas as shown on the page. Returns the magnified view's source: the zoom makes the sample's diameter span 96 of the view's 144 pixels, held from once to eight times the photograph as shown; the source square is held inside the canvas at every corner, and mx, my and mr give the sample's centre and radius in the view's pixels, which leave the view's middle near a corner. */
export function placeSurfaceViewSource(x: number, y: number, r: number, cw: number, ch: number, boxWidth: number, boxHeight: number): PlaceViewSource {
  const shown = Math.min(boxWidth, boxHeight);
  const diameter = 2 * r * shown;
  const zoom = diameter > 0 ? hold(PLACE_VIEW_SPAN / diameter, 1, 8) : 1;
  const sw = Math.min(cw, boxWidth > 0 ? PLACE_VIEW / zoom * cw / boxWidth : cw);
  const sh = Math.min(ch, boxHeight > 0 ? PLACE_VIEW / zoom * ch / boxHeight : ch);
  const sx = hold(x * cw - sw / 2, 0, Math.max(0, cw - sw));
  const sy = hold(y * ch - sh / 2, 0, Math.max(0, ch - sh));
  const mx = sw > 0 ? (x * cw - sx) / sw * PLACE_VIEW : 0;
  const my = sh > 0 ? (y * ch - sy) / sh * PLACE_VIEW : 0;
  const mr = sw > 0 ? r * Math.min(cw, ch) / sw * PLACE_VIEW : 0;
  return { sx, sy, sw, sh, zoom, mx, my, mr };
}

/** Takes cx and cy, the marker's centre in the window's pixels; ring, its radius in pixels; touch, true after a touch; vw and vh, the window's size. Returns {left, top, above}: where the 144-pixel magnified view stands. After a touch it stands above the marker, centred over it, its lower edge 16 pixels above the ring and at least 60 pixels above the point of contact, and where there is no room above it stands to the side with more room at the same clearance; after a mouse, a pen or the keys it stands to the right of the marker, or to the left where the right has no room. Held inside the window. */
export function placeSurfaceViewPlace(cx: number, cy: number, ring: number, touch: boolean, vw: number, vh: number): { left: number; top: number; above: boolean } {
  const maxLeft = Math.max(0, vw - PLACE_VIEW), maxTop = Math.max(0, vh - PLACE_VIEW);
  if (touch) {
    const bottom = Math.min(cy - ring - PLACE_VIEW_GAP, cy - PLACE_VIEW_ABOVE);
    const top = bottom - PLACE_VIEW;
    if (top >= 0) return { left: hold(cx - PLACE_VIEW / 2, 0, maxLeft), top, above: true };
  }
  const roomLeft = cx - ring - PLACE_VIEW_GAP;
  const roomRight = vw - (cx + ring + PLACE_VIEW_GAP);
  const toRight = touch ? roomRight >= roomLeft : roomRight >= PLACE_VIEW || roomRight >= roomLeft;
  const left = toRight ? cx + ring + PLACE_VIEW_GAP : cx - ring - PLACE_VIEW_GAP - PLACE_VIEW;
  return { left: hold(left, 0, maxLeft), top: hold(cy - PLACE_VIEW / 2, 0, maxTop), above: false };
}

const SVGNS = "http://www.w3.org/2000/svg";
let instances = 0;

/** Takes tag, a tag name; cls, a class name or empty; text, the element's text or undefined. Returns the new element. */
function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Takes tag, an SVG tag name; attrs, its attributes by name. Returns the new SVG element. */
function shape(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  return e;
}

/** Takes v, a fraction. Returns it as a percentage in words to one decimal, such as 4.0 percent. */
function pct(v: number): string {
  return `${(v * 100).toFixed(1)} percent`;
}

/** Takes host, the element the surface builds inside; canvas, the canvas the photograph is shown on; options, the kept samples to start from, the names offered and the function called with the samples at every change. Returns an object with samples, set and destroy. What it must satisfy: nothing outside the host is changed; every control is a real button or input with a label of 44 pixels or more; a drag is never the only way to move or size; a placing, a move by a tap, Confirm, Cancel, a name's button and a removal act on release and a press released outside its target does nothing; no action waits on a time; a second pointer pressed while one is down is ignored; the live region says each placing, move, size change, confirm, cancel and removal. Consumer: the test page's sample part. */
export function placeSurface(host: HTMLElement, canvas: HTMLCanvasElement, options: PlaceSurfaceOptions): PlaceSurface {
  const uid = `ps${++instances}`;
  let kept: PlaceSample[] = [];
  let names: string[] = [];
  let chosen = "";
  let pos = PLACE_SIZE_START;
  let allowance = 16;
  let marker: { x: number; y: number; r: number } | null = null;
  let touch = false;
  let note = "";

  const root = make("div", "ps-root");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Named samples on the photograph");
  const live = make("div", "ps-live");
  live.id = `${uid}-live`;
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-label", "What the sample surface just did");
  const say = (text: string): void => { live.textContent = text; };

  const overlay = make("div", "ps-overlay");
  overlay.tabIndex = 0;
  overlay.setAttribute("role", "group");
  overlay.setAttribute("aria-label", "Photograph surface. Tap or click to place a sample. With a marker standing, the arrow keys move it, Shift with an arrow moves it by its whole radius, Enter confirms and Escape cancels.");
  const svg = shape("svg", { class: "ps-svg", preserveAspectRatio: "none", "aria-hidden": "true" }) as SVGSVGElement;
  overlay.appendChild(svg);

  const view = make("div", "ps-view");
  view.hidden = true;
  view.setAttribute("aria-hidden", "true");
  const vcanvas = make("canvas", "ps-view-canvas");
  vcanvas.width = PLACE_VIEW;
  vcanvas.height = PLACE_VIEW;
  const vsvg = shape("svg", { class: "ps-view-svg", viewBox: `0 0 ${PLACE_VIEW} ${PLACE_VIEW}`, "aria-hidden": "true" });
  view.appendChild(vcanvas);
  view.appendChild(vsvg);

  const panel = make("div", "ps-panel");
  const btn = (label: string, onClick: () => void, cls = ""): HTMLButtonElement => {
    const b = make("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  };
  const group = (title: string): HTMLElement => {
    const g = make("div", "ps-group");
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", title);
    const h = make("div", "ps-title", title);
    h.setAttribute("aria-hidden", "true");
    g.appendChild(h);
    return g;
  };

  // Place and move.
  const gMove = group("Place and move the marker");
  const rowMove = make("div", "ps-row");
  const bPlace = btn("Place a marker in the middle", () => place(0.5, 0.5, false));
  const bUp = btn("Up", () => nudge("up"));
  const bDown = btn("Down", () => nudge("down"));
  const bLeft = btn("Left", () => nudge("left"));
  const bRight = btn("Right", () => nudge("right"));
  rowMove.append(bPlace, bLeft, bRight, bUp, bDown);
  gMove.appendChild(rowMove);

  // Size.
  const gSize = group("Size of the sample");
  const rowSize = make("div", "ps-row");
  const bSmaller = btn("Smaller", () => resize(-4, true));
  const bLarger = btn("Larger", () => resize(4, true));
  const sliderLabel = make("label", "ps-label", "Sample size");
  sliderLabel.htmlFor = `${uid}-size`;
  const slider = make("input", "ps-slider");
  slider.id = `${uid}-size`;
  slider.type = "range";
  slider.min = "0";
  slider.max = String(PLACE_SIZE_MAX);
  slider.step = "1";
  slider.value = String(pos);
  rowSize.append(bSmaller, sliderLabel, slider, bLarger);
  gSize.appendChild(rowSize);

  // Names.
  const gName = group("Name of the sample");
  const rowNames = make("div", "ps-row");
  const rowOther = make("div", "ps-row");
  const otherLabel = make("label", "ps-label", "Another name");
  otherLabel.htmlFor = `${uid}-other`;
  const other = make("input", "ps-text");
  other.id = `${uid}-other`;
  other.type = "text";
  other.maxLength = PLACE_NAME_MAX;
  other.autocomplete = "off";
  const bUse = btn("Use this name", () => useTyped());
  rowOther.append(otherLabel, other, bUse);
  const nameLine = make("p", "ps-line");
  gName.append(rowNames, rowOther, nameLine);

  // Tap allowance.
  const gTap = group("Tap allowance");
  const rowTap = make("div", "ps-row");
  const tapLabel = make("label", "ps-label", "A press that moves less than this is a tap");
  tapLabel.htmlFor = `${uid}-tap`;
  const tapSel = make("select", "ps-select");
  tapSel.id = `${uid}-tap`;
  for (const v of [8, 16, 32]) {
    const o = make("option", "", `${v} pixels`);
    o.value = String(v);
    if (v === allowance) o.selected = true;
    tapSel.appendChild(o);
  }
  rowTap.append(tapLabel, tapSel);
  gTap.appendChild(rowTap);

  // Confirm and Cancel, at the two ends of their row.
  const gDone = group("Keep or drop the marker");
  const rowDone = make("div", "ps-row ps-ends");
  const bCancel = btn("Cancel", () => cancel());
  const bConfirm = btn("Confirm", () => confirm());
  rowDone.append(bCancel, bConfirm);
  const needLine = make("p", "ps-line");
  needLine.id = `${uid}-need`;
  bConfirm.setAttribute("aria-describedby", needLine.id);
  gDone.append(rowDone, needLine);

  // The list of kept samples.
  const gList = group("Kept samples");
  const list = make("ul", "ps-list");
  const listLine = make("p", "ps-line");
  gList.append(list, listLine);

  panel.append(gMove, gSize, gName, gTap, gDone, gList);
  root.append(live, overlay, view, panel);
  host.appendChild(root);

  /** Takes nothing. Returns the canvas's box on the screen. */
  const boxNow = (): PlaceBox => {
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  /** Takes nothing. Returns nothing; sets the overlay over the canvas, from the difference of the two boxes, and draws the rings and the view again. */
  function layout(): void {
    const b = boxNow();
    const r0 = root.getBoundingClientRect();
    overlay.style.left = `${b.left - r0.left - root.clientLeft}px`;
    overlay.style.top = `${b.top - r0.top - root.clientTop}px`;
    overlay.style.width = `${b.width}px`;
    overlay.style.height = `${b.height}px`;
    svg.setAttribute("viewBox", `0 0 ${b.width} ${b.height}`);
    draw(b);
  }

  /** Takes b, the canvas's box. Returns nothing; redraws the kept samples' rings with their names, the marker, and the magnified view. */
  function draw(b: PlaceBox): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const short = Math.min(b.width, b.height);
    const order: string[] = [];
    kept.forEach((s) => {
      if (order.indexOf(s.name) < 0) order.push(s.name);
      const style = (order.indexOf(s.name) % 4) + 1;
      const cx = s.x * b.width, cy = s.y * b.height, rad = s.r * short;
      const g = shape("g", { class: "ps-kept" });
      g.appendChild(shape("circle", { class: "ps-dark", cx, cy, r: rad }));
      g.appendChild(shape("circle", { class: "ps-dark", cx, cy, r: rad }));
      g.appendChild(shape("circle", { class: `ps-light ps-dash-${style}`, cx, cy, r: rad }));
      const t = shape("text", { class: "ps-name", x: cx, y: cy - rad - 6 > 14 ? cy - rad - 6 : cy + rad + 16 });
      t.textContent = s.name;
      g.appendChild(t);
      svg.appendChild(g);
    });
    if (marker) {
      const cx = marker.x * b.width, cy = marker.y * b.height, rad = marker.r * short;
      const g = shape("g", { class: "ps-marker" });
      g.appendChild(shape("circle", { class: "ps-dark", cx, cy, r: rad }));
      g.appendChild(shape("circle", { class: "ps-dark", cx, cy, r: rad }));
      g.appendChild(shape("circle", { class: "ps-light", cx, cy, r: rad }));
      for (const [x1, y1, x2, y2] of [[cx - 12, cy, cx + 12, cy], [cx, cy - 12, cx, cy + 12]]) {
        g.appendChild(shape("line", { class: "ps-dark", x1, y1, x2, y2 }));
        g.appendChild(shape("line", { class: "ps-light", x1, y1, x2, y2 }));
      }
      svg.appendChild(g);
    }
    drawView(b);
  }

  /** Takes b, the canvas's box. Returns nothing; shows the magnified view while a marker stands and hides it otherwise. */
  function drawView(b: PlaceBox): void {
    if (!marker || !(b.width > 0)) { view.hidden = true; return; }
    view.hidden = false;
    const src = placeSurfaceViewSource(marker.x, marker.y, marker.r, canvas.width, canvas.height, b.width, b.height);
    try {
      const ctx = vcanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, PLACE_VIEW, PLACE_VIEW);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, src.sx, src.sy, src.sw, src.sh, 0, 0, PLACE_VIEW, PLACE_VIEW);
      }
    } catch { /* a canvas that cannot be read leaves the view with its rings only */ }
    while (vsvg.firstChild) vsvg.removeChild(vsvg.firstChild);
    vsvg.appendChild(shape("circle", { class: "ps-dark", cx: src.mx, cy: src.my, r: src.mr }));
    vsvg.appendChild(shape("circle", { class: "ps-dark", cx: src.mx, cy: src.my, r: src.mr }));
    vsvg.appendChild(shape("circle", { class: "ps-light", cx: src.mx, cy: src.my, r: src.mr }));
    for (const [x1, y1, x2, y2] of [[src.mx - 8, src.my, src.mx + 8, src.my], [src.mx, src.my - 8, src.mx, src.my + 8]]) {
      vsvg.appendChild(shape("line", { class: "ps-dark", x1, y1, x2, y2 }));
      vsvg.appendChild(shape("line", { class: "ps-light", x1, y1, x2, y2 }));
    }
    const c = placeSurfaceFromFrame(marker.x, marker.y, b);
    const ring = marker.r * Math.min(b.width, b.height);
    const p = placeSurfaceViewPlace(c.px, c.py, ring, touch, window.innerWidth, window.innerHeight);
    view.style.left = `${p.left}px`;
    view.style.top = `${p.top}px`;
  }

  /** Takes nothing. Returns nothing; brings the buttons, the name row, the list and the lines to the state. */
  function refresh(): void {
    const has = marker !== null;
    for (const b of [bUp, bDown, bLeft, bRight]) b.disabled = !has;
    bPlace.disabled = has;
    bCancel.disabled = !has;
    bConfirm.disabled = !has || chosen === "";
    needLine.textContent = !has ? "Place a marker on the picture first." : chosen === "" ? "A name is needed before Confirm." : `Confirm keeps this place and size as a sample named ${chosen}.`;
    slider.value = String(pos);
    slider.setAttribute("aria-valuetext", `${pct(placeSurfaceRadius(pos))} of the shorter side`);
    bSmaller.disabled = pos <= 0;
    bLarger.disabled = pos >= PLACE_SIZE_MAX;
    rowNames.replaceChildren();
    for (const n of names) {
      const b = btn(n, () => choose(n), "ps-name-btn");
      b.setAttribute("aria-pressed", n === chosen ? "true" : "false");
      rowNames.appendChild(b);
    }
    nameLine.textContent = note !== "" ? note : chosen === "" ? "No name is chosen." : `The chosen name is ${chosen}.`;
    list.replaceChildren();
    kept.forEach((s, i) => {
      const li = make("li", "ps-item");
      li.appendChild(make("span", "ps-item-text", `${s.name}: ${pct(s.x)} across, ${pct(s.y)} down, size ${pct(s.r)} of the shorter side`));
      const rm = btn("Remove", () => remove(i), "ps-remove");
      rm.setAttribute("aria-label", `Remove sample ${i + 1}, ${s.name}`);
      li.appendChild(rm);
      list.appendChild(li);
    });
    listLine.textContent = kept.length === 0 ? "No sample is kept." : `${kept.length} of at most ${PLACE_SAMPLES_MAX} samples kept.`;
    layout();
  }

  /** Takes nothing. Returns nothing; calls the page's function with a copy of the kept samples. */
  function changed(): void {
    try { options.onChange(kept.map((s) => ({ ...s }))); } catch { /* the page's own keeping failed; the surface carries on */ }
  }

  /** Takes x and y, a centre as fractions; fromTouch, true after a touch. Returns nothing; stands the marker there at the current size, or moves it there if one stands, and says so. */
  function place(x: number, y: number, fromTouch: boolean): void {
    const c = placeSurfaceClamp(x, y);
    const had = marker !== null;
    touch = fromTouch;
    marker = { x: c.x, y: c.y, r: placeSurfaceRadius(pos) };
    note = "";
    say(`${had ? "Marker moved" : "Marker placed"}: ${pct(c.x)} across and ${pct(c.y)} down, size ${pct(marker.r)} of the shorter side.`);
    refresh();
  }

  /** Takes dir, a direction; whole, true to move by the whole radius. Returns nothing; moves the marker by a step. */
  function nudge(dir: "left" | "right" | "up" | "down", whole = false): void {
    if (!marker) return;
    const b = boxNow();
    const c = placeSurfaceStep(marker.x, marker.y, marker.r, dir, whole, b.width, b.height);
    marker = { x: c.x, y: c.y, r: marker.r };
    touch = false;
    say(`Marker moved ${dir}: ${pct(c.x)} across and ${pct(c.y)} down.`);
    refresh();
  }

  /** Takes delta, a change in size positions; announce, true to say the new size. Returns nothing; sets the size of the standing marker and of the next. */
  function resize(delta: number, announce: boolean): void {
    pos = placeSurfaceSizeMove(pos, delta);
    if (marker) marker = { x: marker.x, y: marker.y, r: placeSurfaceRadius(pos) };
    if (announce) say(`Sample size ${pct(placeSurfaceRadius(pos))} of the shorter side.`);
    refresh();
  }

  /** Takes n, a name. Returns nothing; chooses it, or lets it go if it is chosen already. */
  function choose(n: string): void {
    chosen = chosen === n ? "" : n;
    note = "";
    say(chosen === "" ? "No name is chosen." : `Name ${chosen} chosen.`);
    refresh();
  }

  /** Takes nothing. Returns nothing; takes the typed name: trimmed, 1 to 40 characters, not the name rest, an offered name chosen and not added twice. */
  function useTyped(): void {
    const n = other.value.trim();
    if (n === "") { note = "A name of 1 to 40 characters is needed."; refresh(); return; }
    if (n.toLowerCase() === REST) { note = `The name ${REST} is the name the report gives to the pixels no sample holds, so it cannot be used.`; refresh(); return; }
    if (names.indexOf(n) < 0) names.push(n);
    chosen = n;
    note = "";
    other.value = "";
    say(`Name ${n} chosen.`);
    refresh();
  }

  /** Takes nothing. Returns nothing; keeps the marker's place, size and the chosen name as one sample, adds it to the list and takes the marker and the view away. Refuses a 65th sample and a missing name with a line that says so. */
  function confirm(): void {
    if (!marker) return;
    if (chosen === "") { note = "A name is needed before Confirm."; say(note); refresh(); return; }
    if (kept.length >= PLACE_SAMPLES_MAX) { note = `No more than ${PLACE_SAMPLES_MAX} samples are kept; remove one first.`; say(note); refresh(); return; }
    kept.push({ name: chosen, x: marker.x, y: marker.y, r: marker.r });
    say(`Sample kept: ${chosen}, ${pct(marker.x)} across and ${pct(marker.y)} down, size ${pct(marker.r)} of the shorter side. ${kept.length} kept.`);
    marker = null;
    note = "";
    refresh();
    changed();
  }

  /** Takes nothing. Returns nothing; takes the marker and the view away and keeps nothing. */
  function cancel(): void {
    if (!marker) return;
    marker = null;
    note = "";
    say("Marker taken away. Nothing was kept.");
    refresh();
  }

  /** Takes i, a kept sample's index. Returns nothing; takes that sample away. */
  function remove(i: number): void {
    const s = kept[i];
    if (!s) return;
    kept.splice(i, 1);
    say(`Sample removed: ${s.name}. ${kept.length} kept.`);
    refresh();
    changed();
  }

  // One pointer at a time. A tap places or moves on release inside the photograph; a drag that began inside the marker's ring moves it and a release outside the photograph puts it back.
  let ptr: { id: number; sx: number; sy: number; mode: "marker" | "tap"; origin: { x: number; y: number }; offx: number; offy: number; trail: { x: number; y: number }[]; moved: boolean } | null = null;

  /** Takes e, a pointer event. Returns whether its point lies inside the canvas's box. */
  const inside = (e: PointerEvent): boolean => {
    const b = boxNow();
    return e.clientX >= b.left && e.clientX <= b.left + b.width && e.clientY >= b.top && e.clientY <= b.top + b.height;
  };

  overlay.addEventListener("pointerdown", (e: PointerEvent) => {
    if (ptr) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const b = boxNow();
    const f = placeSurfaceToFrame(e.clientX, e.clientY, b);
    let mode: "marker" | "tap" = "tap";
    let offx = 0, offy = 0;
    if (marker) {
      const c = placeSurfaceFromFrame(marker.x, marker.y, b);
      const ring = marker.r * Math.min(b.width, b.height);
      if (Math.hypot(e.clientX - c.px, e.clientY - c.py) <= ring) { mode = "marker"; offx = f.x - marker.x; offy = f.y - marker.y; }
    }
    ptr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, mode, origin: marker ? { x: marker.x, y: marker.y } : { x: 0.5, y: 0.5 }, offx, offy, trail: [{ x: e.clientX, y: e.clientY }], moved: false };
    touch = e.pointerType === "touch";
    try { overlay.setPointerCapture(e.pointerId); } catch { /* capture is a help and not needed */ }
    try { overlay.focus({ preventScroll: true }); } catch { /* the surface keeps its focus ring only when it can take focus */ }
  });

  overlay.addEventListener("pointermove", (e: PointerEvent) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    if (!ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > allowance) ptr.moved = true;
    if (ptr.mode !== "marker" || !ptr.moved || !marker) return;
    ptr.trail.push({ x: e.clientX, y: e.clientY });
    if (ptr.trail.length > 4) ptr.trail.shift();
    let mx = 0, my = 0;
    for (const p of ptr.trail) { mx += p.x; my += p.y; }
    mx /= ptr.trail.length;
    my /= ptr.trail.length;
    const f = placeSurfaceToFrame(mx, my, boxNow());
    const c = placeSurfaceClamp(f.x - ptr.offx, f.y - ptr.offy);
    marker = { x: c.x, y: c.y, r: marker.r };
    layout();
  });

  overlay.addEventListener("pointerup", (e: PointerEvent) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const cur = ptr;
    ptr = null;
    try { overlay.releasePointerCapture(e.pointerId); } catch { /* released already */ }
    const ok = inside(e);
    if (cur.mode === "marker") {
      if (cur.moved) {
        if (ok && marker) say(`Marker moved: ${pct(marker.x)} across and ${pct(marker.y)} down.`);
        else if (marker) { marker = { x: cur.origin.x, y: cur.origin.y, r: marker.r }; say("The drag ended outside the photograph, so the marker is back where it stood."); }
      }
      refresh();
      return;
    }
    if (!cur.moved && ok) {
      const f = placeSurfaceToFrame(e.clientX, e.clientY, boxNow());
      place(f.x, f.y, e.pointerType === "touch");
    }
  });

  overlay.addEventListener("pointercancel", (e: PointerEvent) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const cur = ptr;
    ptr = null;
    if (cur.mode === "marker" && cur.moved && marker) { marker = { x: cur.origin.x, y: cur.origin.y, r: marker.r }; say("The drag was cancelled, so the marker is back where it stood."); }
    refresh();
  });

  overlay.addEventListener("keydown", (e: KeyboardEvent) => {
    const dirs: Record<string, "left" | "right" | "up" | "down"> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (dirs[e.key] && marker) { e.preventDefault(); nudge(dirs[e.key], e.shiftKey); return; }
    if (e.key === "Enter") { e.preventDefault(); if (marker) confirm(); else place(0.5, 0.5, false); return; }
    if (e.key === "Escape" && marker) { e.preventDefault(); cancel(); }
  });

  slider.addEventListener("input", () => {
    pos = placeSurfaceSizeMove(Number(slider.value), 0);
    if (marker) marker = { x: marker.x, y: marker.y, r: placeSurfaceRadius(pos) };
    slider.setAttribute("aria-valuetext", `${pct(placeSurfaceRadius(pos))} of the shorter side`);
    layout();
  });
  slider.addEventListener("change", () => resize(0, true));
  tapSel.addEventListener("change", () => { allowance = Number(tapSel.value) || 16; });
  other.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); useTyped(); } });

  const onWindow = (): void => layout();
  window.addEventListener("resize", onWindow);
  window.addEventListener("scroll", onWindow, { passive: true, capture: true });
  let watcher: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    watcher = new ResizeObserver(() => layout());
    watcher.observe(canvas);
    watcher.observe(root);
  }

  /** Takes list, samples. Returns the ones with a name of 1 to 40 characters that is not rest and finite figures, copied, to at most 64. */
  const sound = (given: PlaceSample[]): PlaceSample[] => {
    const out: PlaceSample[] = [];
    for (const s of given || []) {
      const n = typeof s.name === "string" ? s.name.trim() : "";
      if (n === "" || n.length > PLACE_NAME_MAX || n === REST) continue;
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !(s.r > 0) || !Number.isFinite(s.r)) continue;
      out.push({ name: n, x: s.x, y: s.y, r: s.r });
      if (out.length >= PLACE_SAMPLES_MAX) break;
    }
    return out;
  };

  names = [];
  for (const n of options.names || []) { const t = String(n).trim(); if (t !== "" && t.length <= PLACE_NAME_MAX && t.toLowerCase() !== REST && names.indexOf(t) < 0) names.push(t); }
  kept = sound(options.samples);
  for (const s of kept) if (names.indexOf(s.name) < 0) names.push(s.name);
  refresh();

  return {
    get samples(): PlaceSample[] { return kept.map((s) => ({ ...s })); },
    set(samples: PlaceSample[]): void {
      kept = sound(samples);
      for (const s of kept) if (names.indexOf(s.name) < 0) names.push(s.name);
      refresh();
    },
    destroy(): void {
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("scroll", onWindow, true);
      if (watcher) watcher.disconnect();
      root.remove();
    },
  };
}
