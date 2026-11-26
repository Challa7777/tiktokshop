const { randomUUID } = require('node:crypto');

const CLOWNPAY_BASE_URL = 'https://pagamento-processador.org.ua';
const PRODUCT_PRICE_CENTS = 32099;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanString(value, field, maxLength = 160) {
  if (typeof value !== 'string') throw httpError(400, `O campo ${field} é obrigatório.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) throw httpError(400, `Confira o campo ${field}.`);
  return cleaned;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function brazilianPhoneDigits(value) {
  const digits = digitsOnly(value);
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
}

function isValidDocument(document) {
  if (/^(\d)\1+$/.test(document)) return false;

  if (document.length === 11) {
    const calculateDigit = (digits) => {
      const sum = digits.reduce((total, digit, index) => total + digit * (digits.length + 1 - index), 0);
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    const digits = [...document].map(Number);
    return calculateDigit(digits.slice(0, 9)) === digits[9]
      && calculateDigit(digits.slice(0, 10)) === digits[10];
  }

  if (document.length === 14) {
    const calculateDigit = (digits, weights) => {
      const remainder = digits.reduce((total, digit, index) => total + digit * weights[index], 0) % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    const digits = [...document].map(Number);
    const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return calculateDigit(digits.slice(0, 12), firstWeights) === digits[12]
      && calculateDigit(digits.slice(0, 13), secondWeights) === digits[13];
  }

  return false;
}

function validatePaymentRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'Dados do pedido inválidos.');
  }

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw httpError(400, 'A quantidade deve estar entre 1 e 10 unidades.');
  }

  const customerInput = body.customer || {};
  const addressInput = body.address || {};
  const customer = {
    name: cleanString(customerInput.name, 'nome', 120),
    email: cleanString(customerInput.email, 'e-mail', 254).toLowerCase(),
    document: digitsOnly(customerInput.document),
    phone: brazilianPhoneDigits(customerInput.phone),
  };

  if (customer.name.split(/\s+/).filter(Boolean).length < 2) throw httpError(400, 'Informe nome e sobrenome do cliente.');
  if (!/^\S+@\S+\.\S+$/.test(customer.email)) throw httpError(400, 'Informe um e-mail válido.');
  if (![11, 14].includes(customer.document.length)) throw httpError(400, 'CPF/CNPJ deve conter 11 ou 14 números.');
  if (!isValidDocument(customer.document)) throw httpError(400, 'CPF/CNPJ inválido. Confira os números informados.');
  if (customer.phone.length < 10 || customer.phone.length > 11) throw httpError(400, 'Informe o telefone com DDD, sem o código do país.');

  const address = {
    street: cleanString(addressInput.street, 'endereço', 160),
    number: cleanString(addressInput.number, 'número', 30),
    neighborhood: cleanString(addressInput.neighborhood, 'bairro', 100),
    city: cleanString(addressInput.city, 'cidade', 100),
    state: cleanString(addressInput.state, 'estado', 2).toUpperCase(),
    zipcode: digitsOnly(addressInput.zipcode),
  };

  if (!/^[A-Z]{2}$/.test(address.state)) throw httpError(400, 'Selecione um estado válido.');
  if (address.zipcode.length !== 8) throw httpError(400, 'CEP deve conter 8 números.');

  if (addressInput.complement) address.complement = cleanString(addressInput.complement, 'complemento', 100);

  return {
    quantity,
    amount: PRODUCT_PRICE_CENTS * quantity,
    customer,
    address,
  };
}

async function requestClownPay(endpoint, options = {}) {
  const apiKey = process.env.CLOWNPAY_API_KEY;
  if (!apiKey || apiKey.includes('COLE_A_CHAVE')) {
    throw httpError(503, 'Pagamento PIX não está configurado no servidor.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${CLOWNPAY_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      // Uma resposta não JSON é tratada como erro genérico do provedor.
    }
    return { response, payload };
  } catch (error) {
    if (error.name === 'AbortError') throw httpError(504, 'O provedor demorou para responder. Tente novamente.');
    throw httpError(502, 'Não foi possível conectar ao provedor de pagamentos.');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createClownPayPayment(input) {
  const payment = validatePaymentRequest(input);
  const reference = `KER-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const gatewayBody = {
    amount: payment.amount,
    description: `Kit Kérastase Gloss Absolu - ${payment.quantity} unidade${payment.quantity === 1 ? '' : 's'}`,
    reference,
    source: 'api_externa',
    customer: payment.customer,
    address: payment.address,
  };

  let gatewayResult;
  try {
    gatewayResult = await requestClownPay('/api/v1/transaction', {
      method: 'POST',
      body: JSON.stringify(gatewayBody),
    });
  } catch (error) {
    error.reference = reference;
    throw error;
  }

  const { response, payload } = gatewayResult;
  if (!response.ok || payload.success === false || payload.status === 'error') {
    const message = typeof payload.message === 'string' ? payload.message : 'Não foi possível gerar o PIX.';
    console.error('[ClownPay] transação recusada', {
      reference,
      httpStatus: response.status,
      providerCode: payload.code || payload.error_code || null,
    });
    const providerStatus = payload.status ? ` (${payload.status})` : '';
    const error = httpError(502, `${message} [ClownPay HTTP ${response.status}${providerStatus}]`);
    error.reference = reference;
    throw error;
  }

  const qrCode = typeof payload.qr_code === 'string' ? payload.qr_code : '';
  const qrCodeBase64 = typeof payload.qr_code_base64 === 'string' ? payload.qr_code_base64 : '';
  if (!qrCode && !qrCodeBase64) {
    const error = httpError(502, 'O provedor não retornou os dados do QR Code PIX.');
    error.reference = reference;
    throw error;
  }

  return {
    success: true,
    transactionId: String(payload.transaction_id ?? payload.id ?? ''),
    reference,
    amountCents: payment.amount,
    qrCode,
    qrCodeBase64,
    expiresAt: payload.expires_at || null,
  };
}

async function getClownPayPaymentStatus(transactionId) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(transactionId || '')) {
    throw httpError(400, 'ID da transação inválido.');
  }

  const query = new URLSearchParams({ action: 'get_transaction', id: transactionId });
  const { response, payload } = await requestClownPay(`/api/v1/query?${query.toString()}`, { method: 'GET' });
  if (!response.ok) throw httpError(502, 'Não foi possível consultar o status do PIX.');
  return {
    success: true,
    status: typeof payload.status === 'string' ? payload.status : 'pending',
  };
}

module.exports = { createClownPayPayment, getClownPayPaymentStatus, httpError };
