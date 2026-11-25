import { createClownPayPayment, getClownPayPaymentStatus } from './cloudflare/clownpay.js';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function handleCreatePayment(request, env) {
  if (!isSameOrigin(request)) return json({ message: 'Origem da requisição não permitida.' }, 403);

  let input;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 32768) {
      return json({ message: 'A requisição excede o tamanho permitido.' }, 413);
    }
    input = JSON.parse(text);
  } catch {
    return json({ message: 'Envie os dados em formato JSON válido.' }, 400);
  }

  try {
    return json(await createClownPayPayment(input, env));
  } catch (error) {
    return json({ message: error.message || 'Não foi possível gerar o PIX.' }, error.status || 502);
  }
}

async function handlePaymentStatus(request, env) {
  if (!isSameOrigin(request)) return json({ message: 'Origem da requisição não permitida.' }, 403);
  const transactionId = new URL(request.url).searchParams.get('id');

  try {
    return json(await getClownPayPaymentStatus(transactionId, env));
  } catch (error) {
    return json({ message: error.message || 'Não foi possível consultar o PIX.' }, error.status || 502);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, paymentsConfigured: Boolean(env.CLOWNPAY_API_KEY) });
    }
    if (pathname === '/api/payments') {
      if (request.method !== 'POST') return json({ message: 'Método não permitido.' }, 405);
      return handleCreatePayment(request, env);
    }
    if (pathname === '/api/payment-status') {
      if (request.method !== 'GET') return json({ message: 'Método não permitido.' }, 405);
      return handlePaymentStatus(request, env);
    }
    if (pathname.startsWith('/api/')) return json({ message: 'Endpoint não encontrado.' }, 404);

    return env.ASSETS.fetch(request);
  },
};
