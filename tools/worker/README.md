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

## ⚠️ Redespliegue pendiente (2026-10-17)

El Worker en producción está DESACTUALIZADO en dos cosas críticas:

1. **Origen del APK bloqueado**: la versión desplegada NO tiene en
   `ALLOWED_ORIGINS` el origen `https://localhost` del WebView de Capacitor.
   Resultado: desde la app INSTALADA toda llamada al proxy muere en el
   preflight CORS con 403 "Forbidden origin" → **los backups de Telegram
   no se suben desde el APK** (solo funcionaban desde el navegador/PWA).
   El worker.js de este repo ya lo permite (más capacitor://localhost y
   http://localhost). `X-App-Key` sigue protegiendo cada request.
2. **Auto-sanación del 409**: un servicio de terceros (tele.goldenherd.com)
   re-registra un webhook sobre el bot y rompe `getUpdates`
   (autodetección del chat). El worker.js de este repo ya hace
   `deleteWebhook` + reintento.

**Hace falta correr el despliegue de arriba UNA VEZ** para que ambas
entren en vigor. Si ya no usas goldenherd con este bot, además bórralo de
ese servicio para dejar de pelear el webhook.

Verificación rápida tras desplegar (debe responder 200, no 403):

    curl -s -o /dev/null -w "%{http_code}" \
      https://tienda-proxy.tienda-ul5r2q.workers.dev/api/tg/getMe \
      -H "X-App-Key: <APP_KEY>" -H "Origin: https://localhost"

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
