# Conectar Google al acceso de la app: lo que te toca a ti

Es el único paso que no puedo hacer por ti, porque se hace dentro de tu cuenta de Google. Son unos 10 minutos. El resto (base de datos en la nube, pantallas de la app, sincronización automática) ya está hecho.

## Lo que necesito de ti al final

Dos textos de Google: el **ID de cliente** (termina en `.apps.googleusercontent.com`) y el **secreto de cliente** (empieza por `GOCSPX-`).

Entrégalos en un **archivo**, no escritos en el chat: por ejemplo súbelos como `google-oauth.txt` junto a donde subiste las credenciales de GitHub. Con ellos conecto Google a la nube de la app y te aviso para que pruebes.

## Paso 1: entrar a Google Cloud Console

Abre https://console.cloud.google.com con la cuenta de Google que quieras usar para administrar la app.

Si te pregunta por un proyecto, crea uno nuevo: menú de proyectos (arriba, junto al logo) → **Nuevo proyecto** → nombre `Tienda Pro` → Crear. Espera unos segundos y asegúrate de tenerlo seleccionado.

## Paso 2: configurar la pantalla de permisos

Es la pantalla que Google muestra cuando alguien entra con su cuenta.

1. En el menú lateral: **APIs y servicios** → **Pantalla de consentimiento de OAuth**. (Si tu consola muestra en su lugar **Google Auth Platform**, entra ahí y usa **Branding** y **Audience**.)
2. Tipo de usuario: **Externo** → Crear.
3. Rellena solo lo obligatorio: nombre de la app `Tienda Pro`, tu correo de Google en correo de asistencia y en datos de contacto. Guarda y continúa. Los permisos (scopes) se dejan como están.
4. **Publicar la app** (que quede «En producción»). Si la dejas en modo de prueba, Google te pedirá volver a entrar cada 7 días.
   Si Google te pidiera una verificación, no la empieces: avísame y lo miramos juntos.

## Paso 3: crear las credenciales

1. En el menú lateral: **APIs y servicios** → **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**. Nombre: `Tienda Pro`.
3. En **URIs de redireccionamiento autorizados** → **Agregar URI** → pega exactamente esto:

   `https://chstqhjoizljlpgehdkn.supabase.co/auth/v1/callback`

4. **Crear**. En la ventana que aparece están el **ID de cliente** y el **secreto de cliente**: cópialos en el archivo.

## Alternativa: hacerlo tú directamente

Si prefieres no pasarme los dos valores, ponlos tú en Supabase y avísame cuando termines:

1. Abre https://supabase.com/dashboard/project/chstqhjoizljlpgehdkn/auth/providers
2. En la lista de proveedores, entra en **Google**, activa el interruptor y pega el ID de cliente y el secreto.
3. **Save**.

## Dos cosas más que te tocan a ti

- **Renueva el token de Supabase que me diste.** Estuvo escrito en el chat, así que conviene cambiarlo cuando yo confirme que terminé: https://supabase.com/dashboard/account/tokens → borra el token anterior y crea otro si lo necesitas. Mientras sigo trabajando no lo borres.
- **Prueba en los teléfonos.** Cuando Google esté conectado, instala la versión nueva en dos teléfonos Android, entra con Google en los dos y comprueba que un producto creado en uno aparece en el otro.
