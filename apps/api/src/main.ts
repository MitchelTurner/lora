import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const DEFAULT_PORT = 3000;

function listenPort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}

function requestPath(req: IncomingMessage): string {
  const raw = req.url ?? '/';
  const query = raw.indexOf('?');
  return query === -1 ? raw : raw.slice(0, query);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const port = listenPort();
const server = createServer((req, res) => {
  const path = requestPath(req);
  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    sendJson(res, 200, { name: 'lora-forge', status: 'ok' });
    return;
  }
  sendJson(res, 404, { status: 'not_found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}, closing server`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
