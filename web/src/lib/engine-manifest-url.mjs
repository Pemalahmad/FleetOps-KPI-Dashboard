/** @param {string} base @param {string} [revision] */
export function engineManifestUrl(base, revision) {
  const path = `${base}/engine/manifest.json`;
  return revision ? `${path}?revision=${revision}` : path;
}
