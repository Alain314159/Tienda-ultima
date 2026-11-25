import { createRouter, createWebHashHistory } from 'vue-router';

/**
 * Rutas de la app.
 * Hash history: compatible con PWA y Capacitor (APK) sin config de servidor.
 * Lazy loading: cada vista se carga solo cuando se visita.
 */
const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
  { path: '/ventas', name: 'ventas', component: () => import('../views/VentasView.vue') },
  { path: '/compras', name: 'compras', component: () => import('../views/ComprasView.vue') },
  { path: '/productos', name: 'productos', component: () => import('../views/ProductosView.vue') },
  { path: '/inventario', name: 'inventario', component: () => import('../views/InventarioView.vue') },
  { path: '/socios', name: 'socios', component: () => import('../views/SociosView.vue') },
  { path: '/gastos', name: 'gastos', component: () => import('../views/GastosView.vue') },
  { path: '/reportes', name: 'reportes', component: () => import('../views/ReportesView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
