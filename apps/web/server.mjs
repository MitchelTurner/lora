import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiUpstream = process.env.API_UPSTREAM
  || (process.env.RAILWAY_ENVIRONMENT ? 'https://lora-forgeapi-production.up.railway.app' : 'http://127.0.0.1:3000');

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

function forwardHeaders(source) {
  const skip = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
  const connection = source.connection;
  if (typeof connection === 'string') {
    for (const name of connection.split(',')) skip.add(name.trim().toLowerCase());
  }
  const headers = { ...source };
  for (const name of skip) delete headers[name];
  return headers;
}

function proxyApi(req, res) {
  const target = new URL(apiUpstream);
  const lib = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = { ...forwardHeaders(req.headers), host: target.host };
  const upstream = lib({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: req.url,
    headers,
  }, (up) => {
    res.writeHead(up.statusCode || 502, forwardHeaders(up.headers));
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) sendText(res, 502, 'The LoRA service is unavailable.');
  });
  req.pipe(upstream);
}

function handle(req, res) {
  const urlPath = requestPath(req.url);
  if (urlPath === '/health') {
    sendText(res, 200, 'ok');
    return;
  }
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }
  if (!existsSync(indexFile)) {
    sendText(res, 500, 'Web build not found. Run npm run build before starting.');
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
  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) sendText(res, 500, 'The LoRA site hit an unexpected error.');
    }
  });
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
