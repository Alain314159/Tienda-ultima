import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const isCapacitor = process.env.CAPACITOR === '1' || mode === 'capacitor';

  return {
    resolve: isCapacitor ? {
      alias: {
        'virtual:pwa-register': '/src/shims/pwa-register.js'
      }
    } : {},
    base: isCapacitor ? './' : '/Tienda-ultima/',
    plugins: [
      vue(),
      !isCapacitor && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          id: '/Tienda-ultima/',
          name: 'Tienda Pro',
          short_name: 'Tienda Pro',
          description: 'Gestion de tienda con datos locales, contabilidad y respaldo en Telegram',
          lang: 'es',
          dir: 'ltr',
          theme_color: '#2196F3',
          background_color: '#f3f4f6',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'portrait',
          scope: '/Tienda-ultima/',
          start_url: '/Tienda-ultima/',
          categories: ['business', 'productivity', 'finance'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ],
          shortcuts: [
            {
              name: 'Nueva Venta',
              short_name: 'Venta',
              description: 'Registrar una venta',
              url: '/Tienda-ultima/#ventas',
              icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
              name: 'Registrar Compra',
              short_name: 'Compra',
              description: 'Registrar entrada de mercancia',
              url: '/Tienda-ultima/#compras',
              icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
              name: 'Arqueo de Caja',
              short_name: 'Arqueo',
              description: 'Auditoria fisica de caja e inventario',
              url: '/Tienda-ultima/#auditoria',
              icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      })
    ].filter(Boolean),
    build: {
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/vue/') || id.includes('/@vue/') || id.includes('/pinia/')) return 'vue-vendor';
              if (id.includes('chart.js')) return 'chart-vendor';
              if (id.includes('jspdf')) return 'pdf-vendor';
              if (id.includes('dexie')) return 'db-vendor';
            }
          }
        }
      }
    }
  };
});
