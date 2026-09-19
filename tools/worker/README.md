# Worker de Cloudflare

Proxy para Telegram Bot API. Vive en Cloudflare, NO en este repo.

## Archivos

- worker.js - codigo del Worker (el que corre en Cloudflare)
- deploy-v3.mjs - script que despliega el Worker desde Termux
- deploy-pizza.mjs - despliega el Worker de Pizza Pro

## Como desplegar (Termux)

    cd ~/tienda-proxy
    source .env
    export CF_API_TOKEN="..."
    export CF_ACCOUNT_ID="..."
    export TG_TOKEN_ACTUAL="..."
    export APP_KEY_ACTUAL="..."
    node ~/tienda-proxy/deploy-v3.mjs

## Que hace

- Bot unico de Telegram, multi-tenant
- KV TIENDA_NAMES: registra nombres unicos por chat_id
- KV backups:<chatId>: indice de backups por chat
- Filtrado por chat_id + nombre para privacidad
- Rotacion automatica: mantiene ultimos 20 backups

## KV namespace

- Nombre: TIENDA_NAMES
- ID: c89ecb4108ce4bd58316f0ce95fccb0a

## URLs

- Worker: https://tienda-proxy.tienda-ul5r2q.workers.dev
- Dashboard: https://dash.cloudflare.com/fd78f4002006695beb9ad65cebf94156/workers
