// Minimal static server for the end-to-end tests: serves out/ on 127.0.0.1 only, like the offline launchers.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 4310);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".png": "image/png",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".gz": "application/gzip", ".csv": "text/csv",
  ".parquet": "application/octet-stream", ".traineddata": "application/octet-stream", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  try {
    let p = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (p !== root && !p.startsWith(root + sep)) throw new Error("outside root");
    if ((await stat(p).catch(() => null))?.isDirectory()) p = join(p, "index.html");
    const body = await readFile(p);   // read first: a missing file must become a 404, not a crash after a 200 header
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
