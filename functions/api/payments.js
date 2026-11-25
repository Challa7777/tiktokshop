import { createClownPayPayment } from '../_lib/clownpay.js';

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

export async function onRequestPost({ request, env }) {
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
