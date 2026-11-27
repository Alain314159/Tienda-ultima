# Instalación — Tienda Pro

Hay dos formas de instalar la app en Android: como **PWA** desde el navegador (la más rápida) o como **APK** (la recomendada, porque se actualiza sola y funciona como app nativa). En iPhone solo está disponible la PWA.

- **Versión:** 6.0.0
- **Demo web:** https://alain314159.github.io/Tienda-ultima/

## PWA desde el navegador (Android)

1. Abre la demo en **Chrome** o **Edge** desde el celular.
2. Toca el menú del navegador (⋮) → **«Instalar aplicación»** o **«Agregar a pantalla de inicio»**.
3. La app se abre en modo standalone (sin barra del navegador) y queda como un icono más en el inicio.
4. Funciona **offline**: una vez instalada, no necesita internet para abrir ni para usar.

**En iPhone (Safari):** Compartir → **«Agregar a pantalla de inicio»**. Las notificaciones requieren iOS 16.4 o superior.

### Actualizar la PWA

La PWA se actualiza sola cuando hay una versión nueva en la web: al abrirla con internet, el *service worker* descarga la nueva versión y la aplica al reiniciar la app. Si ves una versión vieja, cierra la app por completo y vuelve a abrirla con internet.

## APK Android (recomendado)

Cada push a `main` corre el pipeline completo (tests → build → deploy) y deja el **APK firmado** como *artifact* de la ejecución:

1. Abre el repositorio en GitHub → pestaña **Actions** → ejecución **«Tests, Build & Deploy»** más reciente.
2. Baja hasta **Artifacts** y descarga `tiendapro-release-…`.
3. En el teléfono, abre el archivo descargado e instala. Android pedirá permitir **«orígenes desconocidos»** (instalar apps de fuera de Play Store): acepta solo para esta instalación.
4. La app se instala como **Tienda Pro** (`com.tiendapro.app`).

### Actualizaciones del APK

- El APK se firma con un **keystore dedicado** (PKCS12, RSA 2048) que vive como *secrets* de GitHub Actions (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) y nunca está en el repositorio.
- **Android solo acepta actualizaciones firmadas con la misma clave.** Guarda una copia del keystore y su contraseña fuera del repo (por ejemplo, en tu nube personal): sin él no se podrá actualizar la app instalada, solo reinstalarla perdiendo los datos locales.
- La app incluye actualización en caliente (OTA) mediante Capgo: los cambios web llegan sin reinstalar el APK.

### Compilar el APK en local

Requisitos: Node 22, Java 21 y el Android SDK.

```bash
# APK de pruebas (firma debug)
npm run apk:debug

# APK de entrega (firma release, necesita el keystore)
export TIENDA_KEYSTORE=ruta/al/tienda-pro-release.keystore
export TIENDA_STORE_PASS='…' TIENDA_KEY_ALIAS=tiendapro TIENDA_KEY_PASS='…'
npm run apk:release
```

Sin esas variables, `assembleRelease` cae a firma debug: sirve para probar en local, pero **no** se puede actualizar una instalación release con un APK firmado en debug.

## Requisitos

- **Android:** versión moderna con Chrome/WebView actualizado. La app usa IndexedDB, Service Worker y WebRTC, disponibles en los navegadores actuales.
- **Espacio:** la app en sí ocupa pocos MB; los datos crecen con el historial de la tienda (ventas, compras, fotos no: la app no guarda fotos).
- **Internet:** solo para instalar, actualizar y sincronizar en la nube. El uso diario no lo necesita.
