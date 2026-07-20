// Flux — a photorealism-first image model, via fal.ai. Flux does NOT produce
// transparent backgrounds, so supportsAlpha is false: the pipeline routes its
// output through the matting stage (Ideogram remove-background) to cut it out.
//
// Endpoint/response shapes are best-effort (docs were egress-blocked when
// written) and confirmed on the first keyed run — this adapter isolates any
// drift, exactly like the Ideogram one did.
import { MIN_REQUEST_GAP_MS } from "../config.mjs";

// fal.ai synchronous run endpoint for Flux 1.1 [pro]; swap the model slug to
// change tier (e.g. fal-ai/flux/dev cheaper, fal-ai/flux-pro/v1.1-ultra sharper).
const ENDPOINT = "https://fal.run/fal-ai/flux-pro/v1.1";
const RETRY_DELAYS_MS = [2000, 8000, 30000];

let lastStart = 0;
async function politeGap() {
  const wait = lastStart + MIN_REQUEST_GAP_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_REQUEST_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
const jitter = (ms) => Math.round(ms * (0.75 + Math.random() * 0.5));
const falKey = () => process.env.FAL_KEY ?? process.env.FLUX_API_KEY ?? "";

export const fluxProvider = {
  name: "flux",
  model: "flux-pro-1.1",
  supportsAlpha: false, // -> cut out via matting (Ideogram remove-background)
  costPerImageUSD: 0.05,
  preflight() {
    if (!falKey()) throw new Error("FAL_KEY is not set — add it as a repo secret (or use --provider mock).");
  },
  // Flux has no negative-prompt field; we fold the constraints into the positive
  // prompt at the template level. seed is honored; aspectRatio maps to a size.
  async generate({ prompt, seed, aspectRatio }) {
    const key = falKey();
    if (!key) throw new Error("FAL_KEY is not set.");
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, jitter(RETRY_DELAYS_MS[attempt - 1])));
      await politeGap();
      try {
        const body = {
          prompt,
          seed,
          num_images: 1,
          image_size: aspectRatio === "1x1" || !aspectRatio ? "square_hd" : aspectRatio,
          output_format: "png",
          // A plain seamless studio backdrop makes the downstream cutout clean.
          // (Folded here as a hint; templates also say it.)
        };
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`flux ${res.status}: ${(await res.text()).slice(0, 300)}`);
          continue;
        }
        if (!res.ok) {
          const err = new Error(`flux ${res.status} (permanent): ${(await res.text()).slice(0, 500)}`);
          err.permanent = true;
          throw err;
        }
        const json = await res.json();
        const img = json?.images?.[0] ?? json?.data?.[0];
        const url = img?.url ?? img;
        if (!url) throw new Error(`flux: no image url in response: ${JSON.stringify(json).slice(0, 300)}`);
        const pngRes = await fetch(url);
        if (!pngRes.ok) {
          lastErr = new Error(`flux image download ${pngRes.status}`);
          continue;
        }
        const png = Buffer.from(await pngRes.arrayBuffer());
        return { png, seed: json?.seed ?? seed, model: "flux-pro-1.1", providerMeta: { url } };
      } catch (e) {
        if (e.permanent) throw e;
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("flux: retries exhausted");
  },
};
