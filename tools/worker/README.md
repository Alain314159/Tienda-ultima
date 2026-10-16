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
    export TIENDA_NAMES_KV_ID="c89ecb4108ce4bd58316f0ce95fccb0a"
    export TG_TOKEN_ACTUAL="..."
    export APP_KEY_ACTUAL="..."
    node ~/tienda-proxy/deploy-v3.mjs

## ⚠️ Redespliegue pendiente (2026-10-16)

El Worker en producción TODAVÍA NO tiene la auto-sanación del 409: un
servicio de terceros (tele.goldenherd.com) re-registra un webhook sobre el
bot y rompe `getUpdates` (autodetección de la app) hasta que alguien lo
borra a mano. El worker.js de este repo ya se defiende solo: si Telegram
responde 409, hace `deleteWebhook` y reintenta. **Hace falta correr el
despliegue de arriba una vez** para que entre en vigor. Si ya no usas
goldenherd con este bot, además bórralo de ese servicio para dejar de
pelear el webhook.

## Que hace

- Bot unico de Telegram, multi-tenant
- KV TIENDA_NAMES: registra nombres unicos por chat_id
- KV backups:<chatId>: indice de backups por chat
- Filtrado por chat_id + nombre para privacidad
- Rotacion automatica: mantiene ultimos 20 backups
- Auto-sanación: webhook pirata (409) → deleteWebhook + reintento

## KV namespace

- Nombre: TIENDA_NAMES
- ID: c89ecb4108ce4bd58316f0ce95fccb0a

## URLs

- Worker: https://tienda-proxy.tienda-ul5r2q.workers.dev
- Dashboard: https://dash.cloudflare.com/fd78f4002006695beb9ad65cebf94156/workers
