import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "dist");
const port = Number(process.env.PORT) || 80;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  let reqPath = (req.url || "/").split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";
  let filePath = path.join(DIST_DIR, reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(DIST_DIR, "index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    if (ext === ".js" || ext === ".html") {
      let content = fs.readFileSync(filePath, "utf8");
      const backendUrl = process.env.VITE_API_URL || "https://reachinbox-backend-production-1e5c.up.railway.app";
      content = content.split("http://localhost:4000").join(backendUrl);
      return res.end(content);
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Frontend server listening on 0.0.0.0:${port}`);
});
