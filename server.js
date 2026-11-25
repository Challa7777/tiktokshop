const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');

const ROOT = __dirname;
loadLocalEnv();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CLOWNPAY_BASE_URL = 'https://pagamento-processador.org.ua';
const PRODUCT_PRICE_CENTS = 32099;
const SELLER_DISCOUNT_CENTS = 900;
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

function cleanString(value, field, maxLength = 160) {
  if (typeof value !== 'string') {
    throw new Error(`O campo ${field} é obrigatório.`);
  }
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new Error(`Confira o campo ${field}.`);
  }
  return cleaned;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function validatePaymentRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Dados do pedido inválidos.');
  }
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error('A quantidade deve estar entre 1 e 10 unidades.');
  }

  const customerInput = body.customer || {};
  const addressInput = body.address || {};
  const name = cleanString(customerInput.name, 'nome', 120);
  const email = cleanString(customerInput.email, 'e-mail', 254).toLowerCase();
  const document = digitsOnly(customerInput.document);
  const phone = digitsOnly(customerInput.phone);

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if (![11, 14].includes(document.length)) throw new Error('CPF/CNPJ deve conter 11 ou 14 números.');
  if (phone.length < 10 || phone.length > 13) throw new Error('Informe um telefone com DDD válido.');

  const address = {
    street: cleanString(addressInput.street, 'endereço', 160),
    number: cleanString(addressInput.number, 'número', 30),
    neighborhood: cleanString(addressInput.neighborhood, 'bairro', 100),
    city: cleanString(addressInput.city, 'cidade', 100),
    state: cleanString(addressInput.state, 'estado', 2).toUpperCase(),
    zipcode: digitsOnly(addressInput.zipcode),
  };

  if (!/^[A-Z]{2}$/.test(address.state)) throw new Error('Selecione um estado válido.');
  if (address.zipcode.length !== 8) throw new Error('CEP deve conter 8 números.');

  if (addressInput.complement) {
    address.complement = cleanString(addressInput.complement, 'complemento', 100);
  }

  const amount = Math.max(100, PRODUCT_PRICE_CENTS * quantity - SELLER_DISCOUNT_CENTS);
  return {
    quantity,
    amount,
    customer: { name, email, document, phone },
    address,
  };
}

async function callClownPay(endpoint, options = {}) {
  if (!process.env.CLOWNPAY_API_KEY || process.env.CLOWNPAY_API_KEY.includes('COLE_A_CHAVE')) {
    const error = new Error('Pagamento PIX não está configurado no servidor.');
    error.statusCode = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${CLOWNPAY_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'X-API-Key': process.env.CLOWNPAY_API_KEY,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const responseText = await response.text();
    let payload;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = {};
    }
    return { response, payload };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createPayment(request, response) {
  if (!isSameOrigin(request)) return sendJson(response, 403, { message: 'Origem da requisição não permitida.' });
  if (isPaymentRateLimited(request.socket.remoteAddress || 'unknown')) {
    return sendJson(response, 429, { message: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
  }

  try {
    const input = await readJsonBody(request);
    let payment;
    try {
      payment = validatePaymentRequest(input);
    } catch (error) {
      error.statusCode = 400;
      throw error;
    }
    const reference = `KER-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const description = `Kit Kérastase Gloss Absolu - ${payment.quantity} unidade${payment.quantity === 1 ? '' : 's'}`;
    const gatewayBody = {
      amount: payment.amount,
      description,
      reference,
      source: 'api_externa',
      customer: payment.customer,
      address: payment.address,
    };

    const { response: gatewayResponse, payload } = await callClownPay('/api/v1/transaction', {
      method: 'POST',
      body: JSON.stringify(gatewayBody),
    });

    if (!gatewayResponse.ok || payload.success === false || payload.status === 'error') {
      const message = typeof payload.message === 'string' ? payload.message : 'Não foi possível gerar o PIX.';
      return sendJson(response, 502, { message });
    }

    const qrCode = typeof payload.qr_code === 'string' ? payload.qr_code : '';
    const qrCodeBase64 = typeof payload.qr_code_base64 === 'string' ? payload.qr_code_base64 : '';
    if (!qrCode && !qrCodeBase64) {
      return sendJson(response, 502, { message: 'O provedor não retornou os dados do QR Code PIX.' });
    }

    return sendJson(response, 200, {
      success: true,
      transactionId: String(payload.transaction_id ?? payload.id ?? ''),
      reference,
      amountCents: payment.amount,
      qrCode,
      qrCodeBase64,
      expiresAt: payload.expires_at || null,
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === 'AbortError' ? 504 : 502);
    const message = error.name === 'AbortError' ? 'O provedor demorou para responder. Tente novamente.' : error.message;
    return sendJson(response, statusCode, { message });
  }
}

async function getPaymentStatus(request, response, requestUrl) {
  const transactionId = requestUrl.searchParams.get('id') || '';
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(transactionId)) {
    return sendJson(response, 400, { message: 'ID da transação inválido.' });
  }

  try {
    const query = new URLSearchParams({ action: 'get_transaction', id: transactionId });
    const { response: gatewayResponse, payload } = await callClownPay(`/api/v1/query?${query.toString()}`, { method: 'GET' });
    if (!gatewayResponse.ok) {
      return sendJson(response, 502, { message: 'Não foi possível consultar o status do PIX.' });
    }
    return sendJson(response, 200, {
      success: true,
      status: typeof payload.status === 'string' ? payload.status : 'pending',
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === 'AbortError' ? 504 : 502);
    const message = error.name === 'AbortError' ? 'Tempo esgotado ao consultar o pagamento.' : error.message;
    return sendJson(response, statusCode, { message });
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
