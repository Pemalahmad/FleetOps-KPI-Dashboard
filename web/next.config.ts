import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// GitHub Pages serves the site under /<repo>; CI sets NEXT_PUBLIC_BASE_PATH. Locally it is "".
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const manifestPath = resolve("public/engine/manifest.json");
const manifestRevision = existsSync(manifestPath) ? createHash("sha256").update(readFileSync(manifestPath)).digest("hex") : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  env: { NEXT_PUBLIC_FLEETOPS_ENGINE_REVISION: manifestRevision },
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
