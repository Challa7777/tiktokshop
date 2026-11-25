import { getClownPayPaymentStatus } from '../_lib/clownpay.js';

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

export async function onRequestGet({ request, env }) {
  if (!isSameOrigin(request)) return json({ message: 'Origem da requisição não permitida.' }, 403);
  const transactionId = new URL(request.url).searchParams.get('id');

  try {
    return json(await getClownPayPaymentStatus(transactionId, env));
  } catch (error) {
    return json({ message: error.message || 'Não foi possível consultar o PIX.' }, error.status || 502);
  }
}
