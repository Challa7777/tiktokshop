const { getClownPayPaymentStatus } = require('../lib/clownpay');

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

module.exports = async function paymentStatusHandler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ message: 'Método não permitido.' });
  }
  if (!isSameOrigin(request)) return response.status(403).json({ message: 'Origem da requisição não permitida.' });

  try {
    const transactionId = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;
    const result = await getClownPayPaymentStatus(transactionId);
    return response.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 502;
    return response.status(statusCode).json({ message: error.message || 'Não foi possível consultar o PIX.' });
  }
};
