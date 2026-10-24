import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('./dist/', import.meta.url));
const indexFile = join(dist, 'index.html');

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function listenPort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw.trim() === '') return 4173;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}

function requestPath(url) {
  const raw = url ?? '/';
  const query = raw.indexOf('?');
  return query === -1 ? raw : raw.slice(0, query);
}

function insideDist(candidate) {
  const root = dist.endsWith(sep) ? dist : dist + sep;
  return candidate === dist || candidate.startsWith(root);
}

function fileFor(urlPath) {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const full = join(dist, relative);
  if (!insideDist(full)) return null;
  return full;
}

function sendFile(res, filePath) {
  const type = types[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  createReadStream(filePath).pipe(res);
}

function sendText(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }
  if (!existsSync(indexFile)) {
    sendText(res, 500, 'Web build not found. Run npm run build before starting.');
    return;
  }

  const urlPath = requestPath(req.url);
  if (urlPath === '/health') {
    sendText(res, 200, 'ok');
    return;
  }

  const candidate = fileFor(urlPath);
  if (candidate === null) {
    sendText(res, 400, 'Bad path');
    return;
  }

  const target = existsSync(candidate) && statSync(candidate).isDirectory()
    ? join(candidate, 'index.html')
    : candidate;

  if (existsSync(target) && statSync(target).isFile()) {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': types[extname(target)] ?? 'application/octet-stream' });
      res.end();
      return;
    }
    sendFile(res, target);
    return;
  }

  if (extname(urlPath) !== '') {
    sendText(res, 404, 'Not found');
    return;
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end();
    return;
  }
  sendFile(res, indexFile);
}

const ports = [...new Set([listenPort(), 8080, 3000, 4173, 5173, 80])];
const servers = [];

for (const listen of ports) {
  const server = createServer(handle);
  server.on('error', (error) => {
    console.error(`Not listening on ${listen}: ${error.message}`);
  });
  server.listen(listen, '0.0.0.0', () => {
    console.log(`LoRA Forge web listening on http://0.0.0.0:${listen}`);
    servers.push(server);
  });
}

function shutdown(signal) {
  console.log(`Received ${signal}, closing server`);
  if (servers.length === 0) process.exit(0);
  let closed = 0;
  for (const server of servers) {
    server.close(() => {
      closed += 1;
      if (closed === servers.length) process.exit(0);
    });
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
