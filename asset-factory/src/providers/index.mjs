// Provider adapter registry. Switching providers is a --provider flag — no
// pipeline code changes (the adapter interface is the whole contract).
//
// @typedef {Object} Provider
// @property {string}  name              e.g. "ideogram"
// @property {string}  model             e.g. "ideogram-v3"
// @property {boolean} supportsAlpha     false -> output must route through matting (v1: not implemented)
// @property {number}  costPerImageUSD   0 for mock; drives the pre-run estimate
// @property {(req: {prompt:string, negativePrompt:string, seed:number,
//                   aspectRatio:string, renderingSpeed?:string}) =>
//            Promise<{png:Buffer, seed:number, model:string, providerMeta?:any}>} generate
import { mockProvider } from "./mock.mjs";
import { ideogramProvider } from "./ideogram.mjs";

const PROVIDERS = {
  mock: mockProvider,
  ideogram: ideogramProvider,
};

export function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`unknown provider "${name}" (have: ${Object.keys(PROVIDERS).join(", ")})`);
  return p;
}

export const PROVIDER_NAMES = Object.keys(PROVIDERS);
