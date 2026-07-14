import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.env.STATIC_ROOT || "site-dist");
const port = Number(process.env.PORT || 4173);
const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".webp", "image/webp"],
  [".png", "image/png"]
]);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) throw new Error("PATH_INTERDIT");
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("FICHIER_ABSENT");
    const body = await readFile(absolute);
    response.writeHead(200, {
      "content-type": types.get(path.extname(absolute).toLowerCase()) || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch (_error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => console.info(`MPP site-dist test server: http://127.0.0.1:${port}`));
