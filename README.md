# 🏪 Tienda Pro

Aplicación web progresiva (PWA) para gestión completa de tienda: ventas, compras, inventario por lotes, caja, patrimonio, socios, contabilidad y reportes. Funciona 100% offline con datos locales (IndexedDB) y se puede instalar como app en el celular.

**Demo:** https://alain314159.github.io/Tienda-ultima/

---

## ✨ Características

### 📊 Dashboard

- Saldo de caja, valor de inventario, ventas y ganancia del período
- Gráfico de ventas vs ganancia (últimos 6 meses)
- Top productos más rentables
- **Detección de anomalías** con niveles (baja / media / alta)
- Accesos rápidos a las operaciones más usadas

### 🛒 Ventas

- Búsqueda de productos por nombre o código
- Carrito con cantidades y precios editables
- **Costo real por FIFO** (respeta lotes con costos distintos)
- Cálculo automático de ganancia por venta
- Cobro con cálculo de vuelto
- Anulación con restauración de stock

### 📦 Compras

- Registro de compras con costo unitario
- Creación automática de lotes
- Edición y eliminación (solo si el lote no tiene ventas)
- Historial completo

### 🏷️ Productos e Inventario

- Gestión de productos con unidad de medida (kg, lb, u, etc.)
- Control de stock por lotes con costo específico
- Alertas de stock bajo y agotado
- Merma / ajuste con cálculo de pérdida real
- Valor del inventario en tiempo real

### 💰 Caja

- Saldo acumulativo con desglose completo
- Arqueo con detección de faltantes / sobrantes
- Movimientos recientes
- Alertas de caja negativa

### 💎 Patrimonio

- Capital, aportes y retiros
- Ganancias acumuladas
- Disponible para retiro
- Historial de movimientos

### 👥 Socios

- CRUD de socios con porcentaje de participación
- **Reparto de ganancia neta** proporcional al porcentaje
- Registro automático en retiros y caja
- Historial de distribuciones

### 💵 Gastos operativos

- Categorías: Luz, Agua, Alquiler, Internet, Transporte, Publicidad, Mantenimiento, Limpieza, Otros
- Método de pago: efectivo, transferencia, tarjeta
- Vinculación automática con caja
- Afecta la ganancia neta

### 📈 Contabilidad

- **Balance de situación** (activos, pasivos, patrimonio)
- **Estado de resultados** (ingresos, COGS, bruta, gastos, mermas, neta)
- **Balance general** con partida doble
- **Flujo de caja** (entradas vs salidas detalladas)
- **Libro diario** con asientos automáticos por cada movimiento
- **Balanza de comprobación** (debe = haber)
- **Cuentas por pagar** (pasivos reales con seguimiento de vencimiento)
- Cierres de período con desglose completo

### 📄 Reportes

- Cuadre por período personalizable (día / mes / rango)
- Tabla consolidada por producto **con desglose por costo/precio**
- Alineación con el dashboard cuando usas "Período actual"
- **Exportar PDF profesional**:
  - Página 1: resumen financiero + situación + reparto socios
  - Página 2+: tabla única consolidada con subfilas por lote
  - Footer en todas las páginas

### 🔔 Sistema

- **Notificaciones push** (stock bajo, hora de arqueo, anomalías críticas, cierre pendiente)
- **PWA instalable** con soporte offline
- Tema claro / oscuro
- PIN de seguridad para operaciones sensibles
- Backup automático diario + exportar / importar respaldo
- Consola de desarrollo (Eruda) activable desde Ajustes

---

## 🚀 Tecnologías

- **Vue 3.5 + TypeScript** — framework principal, todo el código en TS
- **`<script setup>` + Pinia** — Composition API en toda la app
- **Vite 8** — bundler y dev server
- **Dexie.js 4** — wrapper de IndexedDB para datos locales (tipado)
- **Vue Router 5** — navegación con lazy loading (hash history)
- **vue-sonner** — toasts
- **reka-ui** — modales accesibles (focus trap, Escape)
- **Zod** — validación de esquemas
- **VueUse** — composables utilitarios (online, watchDebounced, useSwipe, …)
- **Chart.js + vue-chartjs** — gráficos declarativos y reactivos (chunks diferidos)
- **mathjs** — evaluador de la calculadora (sandbox, sin `eval`; carga diferida)
- **MiniSearch** — búsqueda global con tolerancia a errores de tipeo
- **lucide-vue-next** — iconos como componentes (tree-shaken, sin `v-html`)
- **jsPDF + autoTable** — generación de PDF
- **vite-plugin-pwa** — soporte PWA con Service Worker
- **Capacitor 8** — empaquetado APK Android + notificaciones nativas

Sin backend. Sin base de datos externa. **Todo vive en el navegador.**

---

## 📱 Instalación como app

1. Abre la demo en Chrome o Edge desde el celular
2. Menú del navegador → **"Instalar aplicación"** o **"Agregar a pantalla de inicio"**
3. La app se abre en modo standalone (sin barra del navegador)
4. Funciona offline
5. Las notificaciones del sistema quedan disponibles

**En iPhone (Safari):** Compartir → "Agregar a pantalla de inicio". Las notificaciones requieren iOS 16.4+.

---

## 🛠️ Desarrollo local

```bash
# Clonar
git clone https://github.com/Alain314159/Tienda-ultima.git
cd Tienda-ultima

# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Build de producción
npm run build

# Preview del build
npm run preview

# Tests (unitarios + montaje de la app)
npm test

# Verificación de tipos (vue-tsc)
npm run typecheck

# Lint (ESLint + Stylelint) y formato (Prettier)
npm run lint
npm run lint:css
npm run format
```

---

## 📂 Estructura

```
Tienda-ultima/
├── .github/workflows/       # Deploy automático a GitHub Pages + APK
├── public/                   # Iconos PWA
├── src/
│   ├── App.vue               # Shell de la app (script setup)
│   ├── main.ts               # Entry point + SW + botón back nativo
│   ├── db.ts                 # Dexie tipado (TiendaProDB, versiones 1-7)
│   ├── types/                # Interfaces de dominio (Producto, Venta, ...)
│   ├── constants.ts          # Constantes globales
│   ├── insights.ts           # Motor de recomendaciones
│   ├── telegram.ts           # Cliente del bot (via Worker proxy)
│   ├── router/               # Rutas con lazy loading
│   ├── stores/               # Pinia: un store por responsabilidad
│   │   ├── useUIStore        # Modales, confirm/prompt, PIN
│   │   ├── useConfigStore    # Configuración
│   │   ├── useProductos/Lotes/Ventas/Compras/Ajustes/
│   │   ├── useCaja/Capital/Gastos/Cierres
│   │   ├── useTelegramStore  # Backups en Telegram
│   │   ├── useBackupStore    # Export/import/cifrado
│   │   ├── useNotificaciones # Notificaciones nativas
│   │   └── useInsightsStore  # Recomendaciones
│   ├── composables/          # useGestos, useHistorial, useGraficos,
│   │                         # useCobro, useCompartir, useCuadre, ...
│   ├── components/           # AjustesModal, BottomNav, Calculator, ...
│   ├── views/                # 8 vistas (dashboard, ventas, compras, ...)
│   ├── services/             # fifo, fechas, pdf, backup, logger, ...
│   ├── utils/                # numero, formato, id, toast, navegacion
│   └── styles.css
├── tests/                    # vitest (db + montaje completo de la app)
├── tools/worker/             # Cloudflare Worker (proxy del bot)
├── tsconfig.json
└── vite.config.ts
```

---

## 🗄️ Modelo de datos

La app usa **IndexedDB** a través de Dexie con 15 tablas:

| Tabla            | Propósito                                |
| ---------------- | ---------------------------------------- |
| `productos`      | Catálogo de productos                    |
| `lotes`          | Lotes de inventario con costo específico |
| `ventas`         | Ventas con items y lotes usados          |
| `compras`        | Compras registradas                      |
| `ajustes`        | Mermas y sobrantes                       |
| `arqueos`        | Arqueos de caja                          |
| `movCaja`        | Movimientos de caja                      |
| `cierres`        | Cierres de período                       |
| `capital`        | Aportes de capital                       |
| `retiros`        | Retiros de ganancia                      |
| `socios`         | Socios con porcentaje                    |
| `distribuciones` | Reparto de ganancias                     |
| `gastos`         | Gastos operativos con categoría          |
| `asientos`       | Libro diario (partida doble)             |
| `pasivos`        | Cuentas por pagar                        |
| `config`         | Configuración y backups                  |

---

## 📊 Lógica de costos (FIFO)

Cada venta descuenta del **lote más antiguo con stock disponible** (First In, First Out). Esto garantiza:

- Costo de venta real por lote
- Ganancia exacta por venta
- Valor de inventario fiel a la realidad

Ejemplo:

```
Compra 1: 10 kg a $5  (lote A)
Compra 2: 10 kg a $8  (lote B)

Venta: 15 kg a $12
→ 10 kg del lote A ($50) + 5 kg del lote B ($40)
→ Costo total: $90 · Ingreso: $180 · Ganancia: $90
```

---

## 🔒 Privacidad

- **Sin servidores.** Todo se procesa en tu dispositivo.
- **Sin cuentas.** No hay login.
- **Sin rastreo.** No hay analytics ni cookies de terceros.
- **Tus datos son tuyos.** Puedes exportarlos e importarlos cuando quieras.
- **PIN hasheado.** El PIN de seguridad se guarda como hash PBKDF2-SHA256 (nunca en claro).
- **Backups cifrados.** AES-256-GCM con derivación PBKDF2 de 600k iteraciones.
- **Auditoría.** Ver [docs/AUDITORIA-2026-10.md](docs/AUDITORIA-2026-10.md) para el informe completo de seguridad y calidad.

---

## 🤝 Contribuir

1. Fork del repo
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit (`git commit -m 'Agrega nueva funcionalidad'`)
4. Push (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📄 Licencia

Uso personal. Consulta al autor para uso comercial.

---

## 👤 Autor

**Alain** · [@Alain314159](https://github.com/Alain314159)

---

<p align="center">
  Hecho para tiendas que quieren control real de su negocio.
</p>
