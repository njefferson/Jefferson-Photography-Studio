// Matting — turn an opaque render (e.g. Flux) into a clean transparent cutout.
// Uses Ideogram's background-removal endpoint, which it does well, reusing the
// existing IDEOGRAM_API_KEY. The pipeline calls this whenever a provider reports
// supportsAlpha: false.
//
// Endpoint/response shape is best-effort (docs egress-blocked) and confirmed on
// the first keyed run; isolated here so any drift is a one-file fix.
import { env } from "../config.mjs";

const ENDPOINT = "https://api.ideogram.ai/v1/ideogram-v3/remove-background";

/** @param {Buffer} png opaque image → Promise<Buffer> transparent PNG */
export async function extractAlpha(png) {
  const key = env.ideogramKey();
  if (!key) throw new Error("IDEOGRAM_API_KEY is not set — needed for background removal.");
  const form = new FormData();
  form.set("image", new Blob([png], { type: "image/png" }), "image.png");
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Api-Key": key }, body: form });
  if (!res.ok) throw new Error(`remove-background ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const ct = res.headers.get("content-type") ?? "";
  // The endpoint may return the PNG bytes directly, or JSON with a signed URL.
  if (ct.includes("application/json")) {
    const json = await res.json();
    const url = json?.data?.[0]?.url ?? json?.url;
    if (!url) throw new Error(`remove-background: no url in response: ${JSON.stringify(json).slice(0, 200)}`);
    const out = await fetch(url);
    if (!out.ok) throw new Error(`remove-background download ${out.status}`);
    return Buffer.from(await out.arrayBuffer());
  }
  return Buffer.from(await res.arrayBuffer());
}

export function mattingAvailable() {
  return Boolean(env.ideogramKey());
}
