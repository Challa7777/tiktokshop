const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createClownPayPayment, getClownPayPaymentStatus } = require('./lib/clownpay');

const ROOT = __dirname;
loadLocalEnv();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_REQUEST_BYTES = 32 * 1024;
const paymentAttempts = new Map();

function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(text);
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function isPaymentRateLimited(ipAddress) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const attempts = (paymentAttempts.get(ipAddress) || []).filter((time) => time > windowStart);
  if (attempts.length >= 8) {
    paymentAttempts.set(ipAddress, attempts);
    return true;
  }
  attempts.push(now);
  paymentAttempts.set(ipAddress, attempts);
  return false;
}

async function readJsonBody(request) {
  let body = '';
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error('A requisição excede o tamanho permitido.');
      error.statusCode = 413;
      throw error;
    }
    body += chunk;
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Envie os dados em formato JSON válido.');
    error.statusCode = 400;
    throw error;
  }
}

async function createPayment(request, response) {
  if (!isSameOrigin(request)) return sendJson(response, 403, { message: 'Origem da requisição não permitida.' });
  if (isPaymentRateLimited(request.socket.remoteAddress || 'unknown')) {
    return sendJson(response, 429, { message: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
  }

  try {
    const input = await readJsonBody(request);
    const result = await createClownPayPayment(input);
    return sendJson(response, 200, result);
  } catch (error) {
    const statusCode = error.statusCode || (error.name === 'AbortError' ? 504 : 502);
    return sendJson(response, statusCode, { message: error.message || 'Não foi possível gerar o PIX.' });
  }
}

async function getPaymentStatus(request, response, requestUrl) {
  const transactionId = requestUrl.searchParams.get('id') || '';
  try {
    const result = await getClownPayPaymentStatus(transactionId);
    return sendJson(response, 200, result);
  } catch (error) {
    const statusCode = error.statusCode || (error.name === 'AbortError' ? 504 : 502);
    return sendJson(response, statusCode, { message: error.message || 'Não foi possível consultar o PIX.' });
  }
}

function serveStatic(request, response, requestUrl) {
  if (!['GET', 'HEAD'].includes(request.method)) return sendText(response, 405, 'Método não permitido.');

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    return sendText(response, 400, 'Caminho inválido.');
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
  if (relativePath.split(/[\\/]/).some((part) => part.startsWith('.'))) {
    return sendText(response, 404, 'Não encontrado.');
  }

  const filePath = path.resolve(ROOT, relativePath);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;
  if (!filePath.startsWith(rootPrefix)) return sendText(response, 403, 'Acesso negado.');

  let file;
  try {
    file = fs.readFileSync(filePath);
  } catch {
    return sendText(response, 404, 'Não encontrado.');
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  response.end(request.method === 'HEAD' ? undefined : file);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, paymentsConfigured: Boolean(process.env.CLOWNPAY_API_KEY) });
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/payments') {
    return createPayment(request, response);
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/payment-status') {
    return getPaymentStatus(request, response, requestUrl);
  }
  if (requestUrl.pathname.startsWith('/api/')) return sendJson(response, 404, { message: 'Endpoint não encontrado.' });
  return serveStatic(request, response, requestUrl);
});

server.listen(PORT, HOST, () => {
  console.log(`Loja disponível em http://localhost:${PORT}`);
});
