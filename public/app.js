const kerastaseImageBase = 'https://www.kerastase.com/-/media/project/loreal/brand-sites/kerastase/emea/inter/products/gloss-absolu/';
const productImages = [
  {
    src: 'https://www.kerastase.com.br/dw/image/v2/AAFM_PRD/on/demandware.static/-/Sites-kerastase-master-catalog/pt_BR/dwa15f1163/2025/KRBR0035-bundle/kit-kerastase-gloss-absolu-rotina-completa.jpg',
    alt: 'Kit completo Kérastase Gloss Absolu com quatro produtos',
  },
  {
    src: `${kerastaseImageBase}bain/packshot-compressed.png?rev=0745fe1d971548c2967be34eb970b6eb`,
    alt: 'Shampoo Bain Crème Hydra-Glaze Kérastase Gloss Absolu, 250 ml',
  },
  {
    src: `${kerastaseImageBase}insta-glaze/packshot.png?rev=bb8aa2b6679c473fa80a8d0f5ab2f11a`,
    alt: 'Condicionador Fondant Insta Glaze Kérastase Gloss Absolu, 250 ml',
  },
  {
    src: `${kerastaseImageBase}anti-frizz-glaze-milk/packshot.png?rev=c45d666eaef245fb9fb4805f9eb548c4`,
    alt: 'Spray Anti-Frizz Glaze Milk Kérastase Gloss Absolu, 190 ml',
  },
  {
    src: `${kerastaseImageBase}anti-frizz-glaze-milk/packshot-2.jpg?rev=9e999dd3f1a4457884369ba72826554e`,
    alt: 'Foto alternativa do spray Anti-Frizz Glaze Milk',
  },
  {
    src: `${kerastaseImageBase}glaze-drops/packshot.png?rev=5589b8ce6dd0483f802157f2a32e98cc`,
    alt: 'Óleo finalizador Glaze Drops Kérastase Gloss Absolu, 45 ml',
  },
  {
    src: `${kerastaseImageBase}glaze-drops/perfect.jpg?rev=41eb161ac1174e8bb61e04a33a4374dc`,
    alt: 'Foto de destaque do óleo Glaze Drops',
  },
  {
    src: `${kerastaseImageBase}anti-frizz-glaze-milk/product-in-hand.jpg?rev=f35062057dd141f7896c1734ccb36f4a`,
    alt: 'Spray Anti-Frizz Glaze Milk Kérastase em mãos',
  },
];

const mainImage = document.querySelector('#mainImage');
const currentImageNumber = document.querySelector('#currentImageNumber');
const thumbnailList = document.querySelector('.thumbnail-list');
let activeImage = 0;
let quantity = 1;
let toastTimeout;
let savedDeliveryAddress = '';
let savedCustomer = null;
let currentPayment = null;
let paymentStatusTimer = null;
let paymentCreationInProgress = false;

productImages.forEach((image, index) => {
  const button = document.createElement('button');
  button.className = `thumbnail${index === 0 ? ' is-selected' : ''}`;
  button.type = 'button';
  button.setAttribute('aria-label', `Ver imagem ${index + 1}: ${image.alt}`);
  button.innerHTML = `<img src="${image.src}" alt="" loading="lazy">`;
  button.addEventListener('click', () => selectImage(index));
  thumbnailList.append(button);
});

function selectImage(index) {
  activeImage = (index + productImages.length) % productImages.length;
  mainImage.style.opacity = '0.35';
  window.setTimeout(() => {
    mainImage.src = productImages[activeImage].src;
    mainImage.alt = productImages[activeImage].alt;
    currentImageNumber.textContent = String(activeImage + 1);
    mainImage.style.opacity = '1';
  }, 100);
  thumbnailList.querySelectorAll('.thumbnail').forEach((button, buttonIndex) => {
    button.classList.toggle('is-selected', buttonIndex === activeImage);
  });
}

document.querySelector('.gallery-arrow.previous').addEventListener('click', () => selectImage(activeImage - 1));
document.querySelector('.gallery-arrow.next').addEventListener('click', () => selectImage(activeImage + 1));

const toast = document.querySelector('.toast');
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('is-visible'), 2500);
}

const purchaseModal = document.querySelector('#purchaseModal');
const checkoutScreen = document.querySelector('#checkoutScreen');
const addressPrompt = document.querySelector('#addressPrompt');
const addressEntryScreen = document.querySelector('#addressEntryScreen');
const addressForm = document.querySelector('#addressForm');
const pixPaymentScreen = document.querySelector('#pixPaymentScreen');
function openPurchaseModal() {
  purchaseModal.classList.add('is-open');
  purchaseModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  updateQuantity();
}
function closePurchaseModal() {
  purchaseModal.classList.remove('is-open');
  purchaseModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function openCheckoutScreen() {
  updateCheckoutSummary();
  checkoutScreen.classList.add('is-open');
  checkoutScreen.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeCheckoutScreen() {
  checkoutScreen.classList.remove('is-open');
  checkoutScreen.setAttribute('aria-hidden', 'true');
  closeAddressPrompt();
  closeAddressEntryScreen();
  closePixPaymentScreen();
  document.body.style.overflow = '';
}

function openAddressPrompt() {
  if (savedDeliveryAddress) {
    showToast(`Endereço de entrega: ${savedDeliveryAddress}`);
    return;
  }
  addressPrompt.querySelector('.address-prompt-view').hidden = false;
  addressPrompt.classList.add('is-open');
  addressPrompt.setAttribute('aria-hidden', 'false');
}

function closeAddressPrompt() {
  addressPrompt.classList.remove('is-open');
  addressPrompt.setAttribute('aria-hidden', 'true');
}

function openAddressEntryScreen() {
  closeAddressPrompt();
  addressEntryScreen.classList.add('is-open');
  addressEntryScreen.setAttribute('aria-hidden', 'false');
  addressEntryScreen.querySelector('input').focus();
}

function closeAddressEntryScreen() {
  addressEntryScreen.classList.remove('is-open');
  addressEntryScreen.setAttribute('aria-hidden', 'true');
}

function openPixPaymentScreen(payment) {
  currentPayment = payment;
  const qrCode = typeof payment.qrCode === 'string' ? payment.qrCode : '';
  const qrBase64 = typeof payment.qrCodeBase64 === 'string' ? payment.qrCodeBase64.trim() : '';
  let qrImageSource = '';

  if (qrBase64.startsWith('data:image/')) {
    qrImageSource = qrBase64;
  } else if (/^[A-Za-z0-9+/]+=*$/.test(qrBase64) && qrBase64.length > 100) {
    qrImageSource = `data:image/png;base64,${qrBase64}`;
  }

  const qrFrame = document.querySelector('#pixQrFrame');
  const qrImage = document.querySelector('#pixQrImage');
  qrFrame.hidden = !qrImageSource;
  document.querySelector('#pixQrUnavailable').hidden = Boolean(qrImageSource);
  if (qrImageSource) qrImage.src = qrImageSource;

  const copyButton = document.querySelector('[data-copy-pix]');
  copyButton.disabled = !qrCode;
  document.querySelector('#pixCode').value = qrCode;
  document.querySelector('#pixAmount').textContent = formatPrice((payment.amountCents || 31199) / 100);
  document.querySelector('#pixExpiration').textContent = payment.expiresAt
    ? `Código válido até ${payment.expiresAt}.`
    : 'Pague pelo aplicativo do seu banco para confirmar o pedido.';
  document.querySelector('#pixPaymentError').hidden = true;
  document.querySelector('#pixStatusBadge').textContent = 'Aguardando pagamento';
  document.querySelector('#pixStatusBadge').classList.remove('is-paid', 'is-failed');
  document.querySelector('#pixPaymentStatus').textContent = 'Escaneie o QR Code com o aplicativo do seu banco.';

  pixPaymentScreen.classList.add('is-open');
  pixPaymentScreen.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  startPaymentStatusPolling(payment.transactionId);
}

function closePixPaymentScreen() {
  pixPaymentScreen.classList.remove('is-open');
  pixPaymentScreen.setAttribute('aria-hidden', 'true');
  stopPaymentStatusPolling();
}

function stopPaymentStatusPolling() {
  if (paymentStatusTimer) window.clearTimeout(paymentStatusTimer);
  paymentStatusTimer = null;
}

function startPaymentStatusPolling(transactionId) {
  stopPaymentStatusPolling();
  if (!transactionId) return;

  let attempts = 0;
  const maxAttempts = 120;
  const checkStatus = async () => {
    if (!pixPaymentScreen.classList.contains('is-open')) return;
    attempts += 1;
    try {
      const response = await fetch(`/api/payment-status?id=${encodeURIComponent(transactionId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.status) {
        const status = String(result.status).toLowerCase();
        const badge = document.querySelector('#pixStatusBadge');
        const statusMessage = document.querySelector('#pixPaymentStatus');
        if (status === 'approved') {
          badge.textContent = 'Pagamento aprovado';
          badge.classList.add('is-paid');
          statusMessage.textContent = 'Pagamento confirmado. Obrigado pela compra!';
          stopPaymentStatusPolling();
          return;
        }
        if (['failed', 'refunded', 'chargeback'].includes(status)) {
          badge.textContent = status === 'refunded' ? 'Pagamento reembolsado' : 'Pagamento não aprovado';
          badge.classList.add('is-failed');
          statusMessage.textContent = 'Não foi possível confirmar este pagamento. Você pode tentar novamente.';
          stopPaymentStatusPolling();
          return;
        }
      }
    } catch {
      // Uma falha temporária de consulta não interrompe a espera pelo pagamento.
    }

    if (attempts < maxAttempts && pixPaymentScreen.classList.contains('is-open')) {
      paymentStatusTimer = window.setTimeout(checkStatus, 5000);
    }
  };

  paymentStatusTimer = window.setTimeout(checkStatus, 5000);
}

async function createPixPayment(customer) {
  if (paymentCreationInProgress) return;
  paymentCreationInProgress = true;
  const submitButton = document.querySelector('#addressSubmitButton');
  const errorMessage = document.querySelector('#addressFormError');
  const buttonLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Gerando PIX...';
  errorMessage.hidden = true;
  errorMessage.textContent = '';

  try {
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity,
        customer: {
          name: customer.name,
          email: customer.email,
          document: customer.document,
          phone: customer.phone,
        },
        address: customer.address,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Não foi possível gerar o pagamento PIX.');
    }

    closeAddressEntryScreen();
    openPixPaymentScreen(result);
  } catch (error) {
    errorMessage.textContent = error.message || 'Falha de conexão. Tente novamente.';
    errorMessage.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = buttonLabel;
    paymentCreationInProgress = false;
  }
}

document.querySelectorAll('[data-buy]').forEach((button) => {
  button.addEventListener('click', openCheckoutScreen);
});
document.querySelectorAll('[data-add-cart], [data-open-cart]').forEach((button) => {
  button.addEventListener('click', openPurchaseModal);
});
document.querySelector('.modal-close').addEventListener('click', closePurchaseModal);
purchaseModal.addEventListener('click', (event) => {
  if (event.target === purchaseModal) closePurchaseModal();
});

function updateQuantity() {
  document.querySelector('#quantity').textContent = String(quantity);
  document.querySelector('#modalTotal').textContent = `R$ ${(320.99 * quantity).toFixed(2).replace('.', ',')}`;
}

function formatPrice(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function updateCheckoutSummary() {
  const subtotal = 320.99 * quantity;
  const original = 1122.85 * quantity;
  const sellerDiscount = 9;
  const total = Math.max(0, subtotal - sellerDiscount);

  document.querySelector('#checkoutQuantity').textContent = String(quantity);
  document.querySelector('#checkoutItemCount').textContent = String(quantity);
  document.querySelector('#checkoutItemLabel').textContent = quantity === 1 ? 'item' : 'itens';
  document.querySelector('#checkoutSubtotal').textContent = formatPrice(subtotal);
  document.querySelector('#checkoutOriginal').textContent = formatPrice(original);
  document.querySelector('#checkoutTotal').textContent = formatPrice(total);
  document.querySelector('#checkoutSavings').textContent = formatPrice(original - total);
}

document.querySelectorAll('[data-qty]').forEach((button) => {
  button.addEventListener('click', () => {
    quantity = button.dataset.qty === 'plus' ? quantity + 1 : Math.max(1, quantity - 1);
    updateQuantity();
  });
});

document.querySelectorAll('[data-checkout-qty]').forEach((button) => {
  button.addEventListener('click', () => {
    quantity = button.dataset.checkoutQty === 'plus' ? quantity + 1 : Math.max(1, quantity - 1);
    updateQuantity();
    updateCheckoutSummary();
  });
});

document.querySelector('[data-close-checkout]').addEventListener('click', closeCheckoutScreen);
checkoutScreen.addEventListener('click', (event) => {
  if (event.target === checkoutScreen) closeCheckoutScreen();
});
document.querySelector('[data-address-later]').addEventListener('click', closeAddressPrompt);
document.querySelector('[data-address-add]').addEventListener('click', openAddressEntryScreen);
document.querySelector('[data-address-back]').addEventListener('click', () => {
  closeAddressEntryScreen();
  openAddressPrompt();
});
addressPrompt.addEventListener('click', (event) => {
  if (event.target === addressPrompt) closeAddressPrompt();
});
addressForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(addressForm);
  savedCustomer = {
    name: String(formData.get('fullName') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    document: String(formData.get('cpf') || '').replace(/\D/g, ''),
    phone: String(formData.get('phone') || '').replace(/\D/g, ''),
    address: {
      street: String(formData.get('street') || '').trim(),
      number: String(formData.get('number') || '').trim(),
      neighborhood: String(formData.get('neighborhood') || '').trim(),
      city: String(formData.get('city') || '').trim(),
      state: String(formData.get('state') || '').trim(),
      zipcode: String(formData.get('cep') || '').replace(/\D/g, ''),
    },
  };
  savedDeliveryAddress = `${savedCustomer.address.street}, ${savedCustomer.address.number}, ${savedCustomer.address.neighborhood}, ${savedCustomer.address.city} (${savedCustomer.address.state}) · CEP ${savedCustomer.address.zipcode}`;
  const addressDisplay = document.querySelector('#checkoutAddressDisplay');
  addressDisplay.textContent = `Entregar em: ${savedDeliveryAddress}`;
  addressDisplay.hidden = false;
  createPixPayment(savedCustomer);
});
document.querySelector('[data-tiktok-coupon]').addEventListener('click', () => {
  showToast('Nenhum cupom adicional disponível no momento.');
});
document.querySelector('[data-checkout-confirm]').addEventListener('click', () => {
  if (currentPayment) {
    openPixPaymentScreen(currentPayment);
  } else if (savedCustomer) {
    createPixPayment(savedCustomer);
  } else {
    openAddressPrompt();
  }
});

document.querySelector('[data-pix-back]').addEventListener('click', closePixPaymentScreen);
document.querySelector('[data-copy-pix]').addEventListener('click', async () => {
  const code = document.querySelector('#pixCode').value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('Código Pix copiado.');
  } catch {
    const codeField = document.querySelector('#pixCode');
    codeField.focus();
    codeField.select();
    document.execCommand('copy');
    showToast('Código Pix copiado.');
  }
});

document.querySelector('.modal-confirm').addEventListener('click', () => {
  document.querySelector('.cart-count').hidden = false;
  document.querySelector('.cart-count').textContent = String(quantity);
  closePurchaseModal();
  showToast('Produto adicionado ao carrinho com sucesso!');
});

document.querySelector('.favorite-button').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.classList.toggle('is-active');
  showToast(button.classList.contains('is-active') ? 'Produto salvo nos favoritos' : 'Produto removido dos favoritos');
});

document.querySelector('.claim-button').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.classList.add('is-claimed');
  button.textContent = 'Resgatado ✓';
  showToast('Cupom de R$ 9 resgatado!');
});

document.querySelectorAll('.helpful-button').forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.toggle('is-helpful');
    button.textContent = button.classList.contains('is-helpful') ? '♡ Obrigada!' : '♡ Sim';
  });
});

const videoModal = document.querySelector('#videoModal');
document.querySelectorAll('[data-video]').forEach((button) => {
  button.addEventListener('click', () => {
    videoModal.querySelector('h2').textContent = button.dataset.video;
    videoModal.classList.add('is-open');
    videoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });
});
function closeVideoModal() {
  videoModal.classList.remove('is-open');
  videoModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
videoModal.querySelector('.modal-close').addEventListener('click', closeVideoModal);
videoModal.addEventListener('click', (event) => {
  if (event.target === videoModal) closeVideoModal();
});

document.querySelector('.search-box button')?.addEventListener('click', () => {
  const query = document.querySelector('.search-box input').value.trim();
  showToast(query ? `Buscando por “${query}”` : 'Digite o que você está procurando');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (addressEntryScreen.classList.contains('is-open')) {
      closeAddressEntryScreen();
    } else if (addressPrompt.classList.contains('is-open')) {
      closeAddressPrompt();
    } else {
      closePurchaseModal();
      closeCheckoutScreen();
      closeVideoModal();
    }
  }
});
