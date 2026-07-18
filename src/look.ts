// Shareable looks. A look is the CREATIVE grade only (see SavedLook) — small
// enough (~0.5 KB of JSON) to travel as a link fragment, a paste-able code, or
// a tiny .ipslook file, with no server and no account. This module is pure
// (no DOM): schema, hardened parsing, and the link/file encodings.
//
// Wire format (key order is deliberate — `f` FIRST, so every emitted payload
// starts with the bytes `{"f":"ips-look"`, which is the import sniff magic):
//   {"f":"ips-look","v":1,"name":"…","look":{ …SavedLook fields… }}
//
// Payloads arrive from ANYWHERE (a tapped link is attacker-controllable), so
// parsing is capped before JSON.parse and every field is coerced AND clamped
// to the range the app's own UI can produce. Names are plain text, max 60
// chars — render them with textContent only, never as markup.

export type SavedLook = {
  swapRB: boolean;
  hue: number;
  sat: number;
  contrast: number;
  tint: [number, number, number];
  glow: number;
  sky: [number, number, number];
  foliage: [number, number, number];
  tone: [number, number, number, number, number];
  lum: number;
  clarity: number;
  dehaze: number;
  sharpen: number;
  texture: number;
  hsl: number[];
  bwOn: boolean;
  bwMix: [number, number, number];
};

export type NamedLook = SavedLook & { name?: string };

export const LOOK_FORMAT = "ips-look";
export const LOOK_VERSION = 1;
export const LOOK_NAME_MAX = 60;
/** Decoded-JSON byte cap; a real payload is ~0.5 KB. */
export const LOOK_JSON_MAX = 8192;
/** base64url token cap, checked BEFORE any decode. */
export const LOOK_TOKEN_MAX = 12000;

/** Links always point at production — a sender testing on staging must not
 *  mint staging links — and at ir.html (the precached URL; the SW cache is
 *  URL-exact, so the pretty /ir alias would break offline receivers). The
 *  fragment never reaches the network at all. */
export const LOOK_LINK_BASE = "https://jefferson-photo-studio.pages.dev/ir.html";

export const tuple3 = (a: unknown, d: [number, number, number]): [number, number, number] =>
  Array.isArray(a) && a.length === 3 ? [+a[0], +a[1], +a[2]] : d;
export const numOr = (v: unknown, d: number): number => (typeof v === "number" && isFinite(v) ? v : d);

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamped = (v: unknown, d: number, lo: number, hi: number) => clampN(numOr(v, d), lo, hi);
const clampT3 = (a: unknown, d: [number, number, number], lo: [number, number, number], hi: [number, number, number]): [number, number, number] => {
  const t = tuple3(a, d);
  return [
    clampN(numOr(t[0], d[0]), lo[0], hi[0]),
    clampN(numOr(t[1], d[1]), lo[1], hi[1]),
    clampN(numOr(t[2], d[2]), lo[2], hi[2]),
  ];
};

// The default tone points and default HSL grid, duplicated from the editor's
// own defaults so this module stays DOM-free. Keep in sync with main.ts
// (TONE_DEFAULT / hslDefault) — the coercion tests pin them.
export const LOOK_TONE_DEFAULT: [number, number, number, number, number] = [0, 0.25, 0.5, 0.75, 1];
export const lookHslDefault = (): number[] => Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? 0 : 1));

/** Coerce unknown data into a SavedLook, clamping every field to the range the
 *  UI itself can produce (ir.html slider bounds; sub-range clamps make hostile
 *  values like 1e308 harmless). Returns null when the shape isn't a look. */
export function coerceLook(s: unknown): SavedLook | null {
  const o = s as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.tone) || typeof o.sat !== "number") return null;
  const tone =
    o.tone.length === 5
      ? (o.tone.map((v, i) => clamped(+v, LOOK_TONE_DEFAULT[i], Math.max(0, LOOK_TONE_DEFAULT[i] - 0.25), Math.min(1, LOOK_TONE_DEFAULT[i] + 0.25))) as [number, number, number, number, number])
      : ([...LOOK_TONE_DEFAULT] as [number, number, number, number, number]);
  const hsl =
    Array.isArray(o.hsl) && o.hsl.length === 24
      ? o.hsl.map((x: unknown, i: number) =>
          i % 3 === 0 ? clamped(x, 0, -60, 60) : i % 3 === 1 ? clamped(x, 1, 0, 2) : clamped(x, 1, 0.3, 1.7),
        )
      : lookHslDefault();
  return {
    swapRB: !!o.swapRB,
    hue: clamped(o.hue, 0, -180, 180),
    sat: clamped(o.sat, 1, 0, 3),
    contrast: clamped(o.contrast, 1, 0.5, 2),
    tint: clampT3(o.tint, [1, 1, 1], [0.1, 0.1, 0.1], [10, 10, 10]),
    glow: clamped(o.glow, 0, 0, 1),
    sky: clampT3(o.sky, [0, 1, 1], [-60, 0, 0.5], [60, 2, 1.5]),
    foliage: clampT3(o.foliage, [0, 1, 1], [-60, 0, 0.5], [60, 2, 1.5]),
    tone,
    lum: clamped(o.lum, 1, 0.5, 2),
    clarity: clamped(o.clarity, 0, -1, 1),
    dehaze: clamped(o.dehaze, 0, -1, 1),
    sharpen: clamped(o.sharpen, 0, 0, 1),
    texture: clamped(o.texture, 0, -1, 1),
    hsl,
    bwOn: !!o.bwOn,
    bwMix: clampT3(o.bwMix, [1, 1, 1], [0, 0, 0], [2, 2, 2]),
  };
}

/** A display-safe name: plain string, control chars stripped, ≤60 chars. */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, LOOK_NAME_MAX).trim();
  return s || undefined;
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Serialize a look (+ optional name) with the fixed key order and rounded
 *  numbers, so payloads are short and always sniffable by their first bytes. */
export function encodeLookPayload(look: SavedLook, name?: string): string {
  const l: Record<string, unknown> = {
    swapRB: look.swapRB,
    hue: round4(look.hue),
    sat: round4(look.sat),
    contrast: round4(look.contrast),
    tint: look.tint.map(round4),
    glow: round4(look.glow),
    sky: look.sky.map(round4),
    foliage: look.foliage.map(round4),
    tone: look.tone.map(round4),
    lum: round4(look.lum),
    clarity: round4(look.clarity),
    dehaze: round4(look.dehaze),
    sharpen: round4(look.sharpen),
    texture: round4(look.texture),
    hsl: look.hsl.map(round4),
    bwOn: look.bwOn,
    bwMix: look.bwMix.map(round4),
  };
  const o: Record<string, unknown> = { f: LOOK_FORMAT, v: LOOK_VERSION };
  const n = cleanName(name);
  if (n) o.name = n;
  o.look = l;
  return JSON.stringify(o);
}

/** UTF-8 → base64url (no padding). Chunked btoa — no giant spread. */
export function toBase64url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url → UTF-8 string, or null for junk/oversized input. Never throws. */
export function fromBase64url(token: string): string | null {
  if (token.length > LOOK_TOKEN_MAX) return null;
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (token.length % 4)) % 4);
    const bin = atob(b64);
    if (bin.length > LOOK_JSON_MAX) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function buildLookLink(look: SavedLook, name?: string): string {
  return `${LOOK_LINK_BASE}#look=${toBase64url(encodeLookPayload(look, name))}`;
}

/** Parse payload JSON (already decoded) into a validated look. */
export function parseLookPayload(json: string): { look: SavedLook; name?: string } | null {
  if (json.length > LOOK_JSON_MAX) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown> | null;
    if (!o || o.f !== LOOK_FORMAT) return null;
    const look = coerceLook(o.look);
    if (!look) return null;
    return { look, name: cleanName(o.name) };
  } catch {
    return null;
  }
}

/** One entry point for every input shape a user can hand us:
 *  a full look link (anything containing "#look=TOKEN"), a bare base64url
 *  token, or the raw payload JSON itself. Returns null when it's none. */
export function parseLookText(text: string): { look: SavedLook; name?: string } | null {
  const t = text.replace(/^\uFEFF/, "").trim();
  if (!t) return null;
  const m = /#look=([A-Za-z0-9_-]+)/.exec(t);
  if (m) {
    const json = fromBase64url(m[1]);
    return json ? parseLookPayload(json) : null;
  }
  if (t.startsWith("{")) return parseLookPayload(t);
  if (/^[A-Za-z0-9_-]+$/.test(t)) {
    const json = fromBase64url(t);
    return json ? parseLookPayload(json) : null;
  }
  return null;
}

// The sniff magic: optional UTF-8 BOM, optional ASCII whitespace, then the
// exact bytes of `{"f":"ips-look"`.
const MAGIC = '{"f":"ips-look"';

/** Byte-level check used by the import sniffer (import.ts). */
export function sniffLook(bytes: Uint8Array): boolean {
  let i = 0;
  if (bytes.length > 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  if (bytes.length - i < MAGIC.length) return false;
  for (let k = 0; k < MAGIC.length; k++) {
    if (bytes[i + k] !== MAGIC.charCodeAt(k)) return false;
  }
  return true;
}

/** Filename for a shared look file: the sanitized name + .ipslook. */
export function lookFileName(name?: string): string {
  const base = (name ?? "").replace(/[/\\:*?"<>|]/g, "").trim().slice(0, LOOK_NAME_MAX) || "look";
  return `${base}.ipslook`;
}
