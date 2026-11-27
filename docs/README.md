# Documentación de Tienda Pro

Tienda Pro es una aplicación web progresiva (PWA) para gestionar una tienda completa: ventas, compras, inventario por lotes, caja, socios, gastos, contabilidad y reportes. Funciona **100% sin internet** con los datos en el propio teléfono (IndexedDB) y se sincroniza de forma opcional por la nube o por WiFi directo entre dos teléfonos.

- **Versión:** 6.0.0
- **Demo:** https://alain314159.github.io/Tienda-ultima/
- **Repositorio:** https://github.com/Alain314159/Tienda-ultima
- **Política de privacidad:** https://alain314159.github.io/Tienda-ultima/privacidad.html

## Para quien usa la app

| Documento | Qué cubre |
| --- | --- |
| [MANUAL-USUARIO.md](MANUAL-USUARIO.md) | Guía de uso por módulo: ventas con FIFO, compras, productos e inventario, caja y arqueos, socios y repartos, gastos, contabilidad, reportes, dashboard, ajustes y búsqueda global. |
| [SINCRONIZACION.md](SINCRONIZACION.md) | Sincronización en la nube con Supabase (entrar con Google) y por WiFi directo entre dos teléfonos: qué viaja, cómo se resuelven los conflictos y las limitaciones. |
| [RESPALDOS.md](RESPALDOS.md) | Autosave, exportar e importar respaldos (planos y cifrados), qué incluye cada formato y cómo restaurar. |
| [SEGURIDAD.md](SEGURIDAD.md) | PIN, cifrado de respaldos, qué datos salen del teléfono y cuáles no, permisos. |
| [INSTALACION.md](INSTALACION.md) | Instalar la app como PWA desde el navegador o como APK en Android. |
| [PREGUNTAS-FRECUENTES.md](PREGUNTAS-FRECUENTES.md) | Problemas comunes y sus soluciones. |

## Para quien desarrolla la app

| Documento | Qué cubre |
| --- | --- |
| [DESARROLLO.md](DESARROLLO.md) | Arquitectura, estructura de carpetas, base de datos y tablas, scripts de npm, tests y CI/CD. |
| [PLAN-CUENTAS-Y-SINCRONIZACION.md](PLAN-CUENTAS-Y-SINCRONIZACION.md) | Plan de cuentas, sincronización y compartición por WiFi (noviembre 2026): decisiones, riesgos y estado de la implementación. |
| [GUIA-CONECTAR-GOOGLE.md](GUIA-CONECTAR-GOOGLE.md) | Pasos para conectar el inicio de sesión con Google al proyecto de Supabase (único paso manual del dueño de la cuenta). |
| [RUEDAS-REINVENTADAS.md](RUEDAS-REINVENTADAS.md) | Inventario de decisiones de diseño: qué se implementó a mano y por qué, y qué librerías se usan para el resto. |
| [AUDITORIA-2026-10.md](AUDITORIA-2026-10.md) y [AUDITORIA-2026-11.md](AUDITORIA-2026-11.md) | Informes de auditoría de seguridad y calidad de octubre y noviembre de 2026. |
| [PLAN-MIGRACION.md](PLAN-MIGRACION.md) | Plan de migración histórico (octubre 2026). Documento de referencia: la migración ya se ejecutó. |

## Navegación rápida de la app

La barra inferior tiene cuatro botones fijos — **Inicio, Ventas, Compras, Inventario** — y un quinto botón, **Más**, que abre el resto de secciones: Productos, Gastos, Socios, Reportes, Compartir por WiFi, Nube y cuenta, y Ajustes. El nombre de la tienda aparece en el encabezado junto al indicador de sincronización (verde: al día; amarillo: sincronizando; rojo: error; gris: sin sesión o sin sincronizar) y, cuando no hay internet, un chip rojo de «sin conexión».

> **Nota:** al abrir «Nube y cuenta» o «Compartir por WiFi» desde el botón **Más**, la hoja se cierra sola y el panel queda a la vista (arreglado el 2026-11-27; antes quedaba abierta tapando el panel).
