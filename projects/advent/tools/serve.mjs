// Local preview with the same routing as nginx.conf: real files are served,
// the secret paths (/<week folder>, /<hjem>) get index.html, the intro (/0-…)
// gets intro.html, everything else 404s.
// Supports Range requests, which Safari needs to play video.

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SITE = path.join(ROOT, "site");
const PORT = Number(process.env.PORT ?? 5173);
const APP_PATH = /^\/([0-4]-[A-Za-z0-9_-]{8,}|[A-Za-z0-9]{16,})\/?$/;
const CONTENT = /\.(txt|json|jpe?g|png|webp|gif|mp4|mov|webm)$/i;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".txt": "text/plain; charset=utf-8", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
};

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(SITE, path.normalize(pathname));
  const isFile = file.startsWith(SITE) && existsSync(file) && (await stat(file)).isFile();
  if (!isFile || pathname === "/") {
    if (CONTENT.test(pathname) || !APP_PATH.test(pathname)) return res.writeHead(404, { "content-type": "text/plain" }).end("404\n");
    file = path.join(SITE, /^\/0-/.test(pathname) ? "intro.html" : "index.html");
  }
  const body = await readFile(file);
  const headers = { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache", "accept-ranges": "bytes" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : body.length - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${body.length}`, "content-length": end - start + 1 });
    return res.end(body.subarray(start, end + 1));
  }
  res.writeHead(200, { ...headers, "content-length": body.length });
  res.end(body);
}).listen(PORT, () => console.log(`http://localhost:${PORT}/`));
