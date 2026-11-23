// FleetOps offline: a tiny static server using only Node's built-in modules (no packages, nothing downloaded).
// Serves ./app on http://127.0.0.1:<port>/ for this computer only. Usage: node serve.mjs [port]
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("./app", import.meta.url)));
const port = Number(process.argv[2] ?? 8765);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".parquet": "application/octet-stream",
  ".gz": "application/gzip", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

function fileFor(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  const path = normalize(join(root, rel));
  if (path !== root && !path.startsWith(root + sep)) return null;   // never serve outside ./app
  for (const candidate of [path, join(path, "index.html"), path + ".html"]) {
    try { if (statSync(candidate).isFile()) return candidate; } catch { /* try the next form */ }
  }
  return null;
}

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
  const file = fileFor(req.url ?? "/");
  if (!file) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found"); return; }
  res.writeHead(200, { "Content-Type": types[extname(file).toLowerCase()] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`FleetOps is running at http://127.0.0.1:${port}/`));
