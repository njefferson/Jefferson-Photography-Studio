// Matting slot — NOT IMPLEMENTED in v1, by design.
//
// The pipeline routes a provider's output through this stage when the provider
// declares supportsAlpha: false (both v1 providers are native-alpha, so today
// nothing reaches it). When a future provider without native transparency is
// added (e.g. Flux, Stability), implement extractAlpha() here — an ML matting
// model or keying pass producing the same feathered-alpha PNG contract QC
// expects — and no other file changes.
export async function extractAlpha(_png) {
  throw new Error(
    "matting is not implemented (v1): use a provider with native alpha (mock, ideogram)",
  );
}
