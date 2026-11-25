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

O valor enviado é calculado no servidor: R$ 320,99 por kit, menos o desconto de vendedor de R$ 9,00 por pedido. Se a oferta mudar, atualize os valores em `lib/clownpay.js` (servidor local/Vercel) e `cloudflare/clownpay.js` (Worker), mantendo-os em sincronia com a página.

## Deploy no Cloudflare Workers

1. No painel Cloudflare, abra **Workers & Pages > Create application > Connect to Git**.
2. Autorize o GitHub e selecione `Challa7777/tiktokshop`, branch `main`.
3. Use o nome `tiktokshop` e deixe o comando de build vazio. O `wrangler.jsonc` define o Worker e a pasta `public` como assets.
4. Em **Settings > Variables and Secrets**, crie o Secret `CLOWNPAY_API_KEY` para Production.
5. Faça o deploy. O Worker em `worker.js` encaminha os assets estáticos e processa as rotas PIX.

O diretório `public/` contém o site estático. `server.js` é usado apenas para desenvolvimento local. Não envie `.env` ou `.dev.vars` ao GitHub.

## Deploy no Vercel

1. Importe o repositório GitHub no Vercel e selecione o preset **Other**.
2. Configure `public` como diretório de saída e não configure um comando para iniciar `server.js` no Vercel.
3. Cadastre `CLOWNPAY_API_KEY` nas variáveis de ambiente do projeto para Production e Preview. Não envie `.env` ao GitHub.
4. Faça o deploy. Os endpoints em `api/` são executados como Vercel Functions.
