// Ideogram 3.0 — the native transparent-background endpoint (alpha is produced
// at generation time, not by post-processing). Docs were proxy-blocked from
// this environment when written, so the exact field names below get a live
// 1-image probe (`generate --provider ideogram --limit 1 --yes`) on the first
// keyed run before any batch; this adapter is the only file that would change.
import { env, MIN_REQUEST_GAP_MS } from "../config.mjs";

const ENDPOINT = "https://api.ideogram.ai/v1/ideogram-v3/generate-transparent";
const RETRY_DELAYS_MS = [2000, 8000, 30000]; // on 429/5xx/network, ±25% jitter

let lastStart = 0;
async function politeGap() {
  const wait = lastStart + MIN_REQUEST_GAP_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_REQUEST_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function jitter(ms) {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

export const ideogramProvider = {
  name: "ideogram",
  model: "ideogram-v3",
  supportsAlpha: true,
  // Rough QUALITY-tier list price; the pre-run estimate is labeled an estimate.
  costPerImageUSD: 0.08,
  // Called once before a run — fail fast and loud if the key is absent, rather
  // than turning every asset into a caught per-asset error.
  preflight() {
    if (!env.ideogramKey())
      throw new Error("IDEOGRAM_API_KEY is not set — export it in this session (or use --provider mock).");
  },
  async generate({ prompt, negativePrompt, seed, aspectRatio, renderingSpeed }) {
    const key = env.ideogramKey();
    if (!key) {
      throw new Error(
        "IDEOGRAM_API_KEY is not set — export it in this session (or use --provider mock).",
      );
    }
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, jitter(RETRY_DELAYS_MS[attempt - 1])));
      await politeGap();
      try {
        const form = new FormData();
        form.set("prompt", prompt);
        if (negativePrompt) form.set("negative_prompt", negativePrompt);
        form.set("seed", String(seed));
        form.set("aspect_ratio", aspectRatio ?? "1x1");
        form.set("rendering_speed", renderingSpeed ?? "QUALITY");
        form.set("num_images", "1");
        const res = await fetch(ENDPOINT, { method: "POST", headers: { "Api-Key": key }, body: form });
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
          if (retryAfter) await new Promise((r) => setTimeout(r, retryAfter));
          lastErr = new Error(`ideogram ${res.status}: ${(await res.text()).slice(0, 300)}`);
          continue; // retryable
        }
        if (!res.ok) {
          // Other 4xx: permanent — recorded on the catalog record, never retried.
          const body = (await res.text()).slice(0, 500);
          const err = new Error(`ideogram ${res.status} (permanent): ${body}`);
          err.permanent = true;
          throw err;
        }
        const json = await res.json();
        const img = json?.data?.[0];
        if (!img?.url) throw new Error(`ideogram: no image url in response: ${JSON.stringify(json).slice(0, 300)}`);
        const pngRes = await fetch(img.url);
        if (!pngRes.ok) {
          lastErr = new Error(`ideogram image download ${pngRes.status}`);
          continue;
        }
        const png = Buffer.from(await pngRes.arrayBuffer());
        return { png, seed: img.seed ?? seed, model: "ideogram-v3", providerMeta: { url: img.url, resolution: img.resolution } };
      } catch (e) {
        if (e.permanent) throw e;
        lastErr = e; // network / transient — retry
      }
    }
    throw lastErr ?? new Error("ideogram: retries exhausted");
  },
};
