# Actualizaciones (OTA manual) — Tienda Pro

Cómo se actualiza la app instalada (APK) sin reinstalarla y sin Capgo Cloud.
La nube de Capgo no interviene: el manifiesto y los paquetes viven en
GitHub Pages y los genera el workflow de despliegue.

## Cómo funciona

1. Haces push a `main` y el workflow `deploy.yml` construye la web.
2. El workflow empaqueta `dist/` en `dist/updates/bundle-<versión>.zip` y
   escribe el manifiesto `dist/updates.json` con la versión, la URL del zip
   y su SHA-256. Ambos se publican en GitHub Pages junto a la PWA.
3. El teléfono, al abrir la app con internet, comprueba en silencio si el
   manifiesto trae una versión distinta a la instalada
   (`src/sync/ota.ts`, `inicializarOTA()`, llamada desde `main.ts`).
4. Si hay una versión nueva, la descarga, verifica el SHA-256 y la deja
   lista (`next()`). **No se aplica todavía.**
5. Al reiniciar la app, el paquete nuevo pasa a ser el activo. La versión
   instalada se guarda en la configuración (`versionApp`); la pendiente,
   en `versionPendiente`, hasta que el reinicio la promueve.

También puedes comprobarlo a mano, sin esperar al próximo arranque:

- **Ajustes → Actualizaciones → Buscar actualizaciones** (botón «Buscar»).
- **Estado del sistema** (desde Ajustes → Sistema → «Estado del sistema»):
  sección «Actualizaciones (OTA)», botón «Buscar actualización ahora».

## Qué significa cada mensaje

| Mensaje | Qué pasó | Qué hacer |
| --- | --- | --- |
| «Ya tienes la última versión» | La instalada coincide con la publicada. | Nada. |
| «Actualización lista: se aplicará al reiniciar» | Se descargó una versión nueva y quedó lista. | Toca **Reiniciar ahora** (en Estado del sistema, el toast de Ajustes trae el mismo botón) o cierra y abre la app. |
| «Sin conexión: no se pudo comprobar» | No había internet al comprobar. | Nada: la app sigue con su versión. Inténtalo cuando tengas conexión. |
| El texto del error (p. ej. manifiesto no válido, descarga fallida) | Algo falló al descargar o verificar. | Nada: la app sigue con la versión actual, nunca queda rota. Inténtalo de nuevo más tarde. |
| «En web, las actualizaciones llegan al recargar» | Estás en la PWA del navegador, no en el APK. | Recarga la página: el service worker trae la última versión publicada. |

En **Estado del sistema** se ve además la **Versión instalada** (la
activa), el **Bundle ID** y la **Versión nativa** (datos del paquete
instalado, leídos del plugin) y, si la hay, la **Actualización pendiente**.

## Cómo publicar una actualización

Solo hay que hacer **push a `main`**. No se sube nada a mano ni se toca
ningún panel.

- La versión es `package.json` + sha corto del commit, por ejemplo
  `6.0.0-a1b2c3d`. La calcula el workflow (`BUILD_VERSION`) y la inyecta
  como `VITE_APP_BUILD`; es la misma en el job web y en el APK.
- Cada push a `main` genera un bundle nuevo (el sha cambia aunque el
  código no), así que cada commit publicado es una versión distinta.
- El bundle y el manifiesto solo se publican si el build web tuvo éxito:
  si el build falla, no se publica nada y los teléfonos siguen con la
  versión anterior.

## Límites: qué NO actualiza la OTA

La OTA solo cambia el contenido web (HTML, JS, CSS). **Los cambios
nativos siguen exigiendo un APK nuevo** e instalarlo: plugins nuevos o
actualizados, permisos, icono, nombre de la app, `appId` y cualquier
cambio en `android/` o en `capacitor.config.json`. Publicar solo el
bundle en ese caso no basta: la app instalada seguiría con el código
nativo viejo.

## Sin internet no pasa nada

Sin conexión la app ni siquiera intenta descargar: la comprobación
silenciosa del arranque y el botón manual devuelven «sin internet» y la
app sigue funcionando con su versión, con todos los datos locales
intactos. No hay reintentos en segundo plano que gasten datos.

## Seguridad: advertencia honesta

- El **SHA-256** del manifiesto protege la **integridad**: si el zip se
  descarga corrupto o modificado en tránsito, el checksum no coincide y
  el paquete se rechaza. La app nunca aplica un paquete con checksum
  distinto al del manifiesto.
- La **autenticidad** descansa en **HTTPS + el control de la cuenta de
  GitHub**: la app solo acepta manifiestos y zips de
  `https://alain314159.github.io/Tienda-ultima/` (cualquier otra URL se
  rechaza antes de descargar). **No hay firma con clave privada**: si
  alguien consiguiera publicar en ese repositorio o en esa página de
  GitHub Pages, podría publicar un manifiesto y un zip válidos que la app
  aceptaría. Por eso la cuenta de GitHub debe tener 2FA activado, no
  compartir el token (PAT) y revisar los pushes a `main`.
- El plugin `@capgo/capacitor-updater` sigue instalado, pero solo como
  mecanismo local (descargar, marcar el siguiente paquete, recargar):
  no habla con ningún servidor de Capgo y no hay cuenta ni nube de por
  medio. En `capacitor.config.json` está en modo manual
  (`autoUpdate: false`, sin `updateUrl`).

## Archivos implicados

| Archivo | Papel |
| --- | --- |
| `src/sync/ota.ts` | Toda la lógica: `validarManifiesto`, `versionActiva`, `comprobarActualizacion`, `reiniciarParaAplicar`, `inicializarOTA`. |
| `src/main.ts` | Llama a `inicializarOTA()` en el bloque nativo al arrancar. |
| `src/components/StatusPanel.vue` | Sección 1, «Actualizaciones (OTA)»: versión instalada, botón de búsqueda y «Reiniciar ahora». |
| `src/components/AjustesModal.vue` | Botón «Buscar actualizaciones» en el grupo **Actualizaciones**. |
| `.github/workflows/deploy.yml` | Genera `dist/updates/bundle-<versión>.zip` y `dist/updates.json` en el job `web`; define `VITE_APP_BUILD` en ambos jobs. |
| `capacitor.config.json` | Modo manual del plugin (`autoUpdate: false`, sin `updateUrl`, `appId: com.tiendapro.app`). |
| `tests/ota.test.js` | Tests del módulo (manifiesto, descarga, sin internet, fallos, promoción). |
| `tests/ui-transversal.test.js` | Tests de la sección OTA de StatusPanel (web, sin internet, ya actualizado, lista + reiniciar, error). |
