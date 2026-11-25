# Checkout PIX ClownPay

## Executar localmente

1. Instale o Node.js 20 ou mais recente.
2. Copie `.env.example` para `.env` e informe a chave da API ClownPay em `CLOWNPAY_API_KEY`.
3. Inicie o servidor com `npm start` (ou `node server.js`).
4. Abra `http://localhost:3000`.

A chave ClownPay fica no servidor. O navegador chama somente `/api/payments` e `/api/payment-status`; não envia a chave secreta ao cliente.

## Fluxo

- O cliente preenche contato e endereço antes da geração do PIX.
- O servidor valida os campos e cria a transação com `source: "api_externa"`, valor em centavos, referência única, cliente e endereço.
- A tela mostra o QR Code/código PIX e consulta o status da transação pelo endpoint de consulta da ClownPay.

O valor enviado é calculado no servidor: R$ 320,99 por kit, menos o desconto de vendedor de R$ 9,00 por pedido. Ajuste os valores em `lib/clownpay.js` se a oferta mudar e mantenha-os em sincronia com os valores exibidos na página.

## Deploy no Vercel

1. Importe o repositório GitHub no Vercel e selecione o preset **Other**.
2. Mantenha os arquivos estáticos (`index.html`, `styles.css` e `app.js`) na raiz e não configure um comando para iniciar `server.js` no Vercel.
3. Cadastre `CLOWNPAY_API_KEY` nas variáveis de ambiente do projeto para Production e Preview. Não envie `.env` ao GitHub.
4. Faça o deploy. Os endpoints em `api/` são executados como Vercel Functions; `server.js` continua sendo apenas o servidor de desenvolvimento local.
