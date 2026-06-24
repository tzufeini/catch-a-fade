// Minimal zero-dependency static server for SIE Mastery.
// Railway (and any Node host) runs `npm start` -> serves this folder on $PORT.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
};

http
  .createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
      // prevent path traversal
      const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
      let filePath = path.join(ROOT, safe);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
          filePath = path.join(ROOT, "index.html"); // fallback
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = TYPES[ext] || "application/octet-stream";
        const cache = ext === ".html" ? "public, max-age=0, must-revalidate" : "public, max-age=86400";
        res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
        fs.createReadStream(filePath).pipe(res);
      });
    } catch (e) {
      res.writeHead(500);
      res.end("Server error");
    }
  })
  .listen(PORT, () => console.log("SIE Mastery static server listening on " + PORT));
