import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '../.output/website');
const port = Number(process.env.CHATPICK_PREVIEW_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CHATPICK_PREVIEW_PORT must be a valid port');
await fs.access(path.join(root, 'index.html')).catch(() => { throw new Error('Build the homepage first with pnpm build:website'); });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); return response.end(); }
  let filename;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    filename = path.resolve(root, '.' + pathname);
    if (filename !== root && !filename.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
    if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    let body = await fs.readFile(filename);
    if (body.length > 1024 && /\.(html|css|js|svg|txt|xml)$/.test(filename)) {
      response.setHeader('Vary', 'Accept-Encoding');
      const accepted = new Map((request.headers['accept-encoding'] || '').split(',').map(value => {
        const [encoding, quality] = value.trim().split(';q=');
        return [encoding, quality === undefined ? 1 : Number(quality)];
      }));
      const encoding = ['br', 'gzip'].find(value => accepted.get(value) > 0);
      if (encoding) {
        body = encoding === 'br' ? brotliCompressSync(body) : gzipSync(body);
        response.setHeader('Content-Encoding', encoding);
      }
    }
    response.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    response.setHeader('Content-Length', body.length);
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error instanceof URIError) { response.writeHead(400); return response.end(); }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.writeHead(404);
    response.end(request.method === 'HEAD' ? undefined : await fs.readFile(path.join(root, '404.html')));
  }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Set CHATPICK_PREVIEW_PORT to another port.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`ChatPick local preview: http://127.0.0.1:${port}/ (browser language) · /?lang=en (English) · /zh-CN/?lang=zh-CN (中文)`));
