<template>
  <component
    :is="comp"
    :color="color"
    :style="{ width: sRem, height: sRem, flexShrink: 0, verticalAlign: 'middle', display: 'inline-block' }"
  />
</template>

<script setup lang="ts">
/**
 * Wrapper global de iconos sobre lucide-vue-next (componentes oficiales,
 * tree-shaken). La API pública no cambia: <icon name size color />, por lo
 * que ningún template necesita modificarse. Sustituye a icons.ts (paths SVG
 * copiados a mano inyectados con v-html).
 */
import { computed } from 'vue';
import {
  Store,
  Home,
  ShoppingCart,
  ShoppingBag,
  Wallet,
  Tag,
  Package,
  BookOpen,
  DollarSign,
  ChartColumn,
  TrendingUp,
  Calendar,
  List,
  File,
  Check,
  X,
  Trash2,
  SquarePen,
  RefreshCw,
  Plus,
  Menu,
  Settings,
  Moon,
  Sun,
  Lock,
  Download,
  Upload,
  CircleAlert,
  Diamond,
  ChevronDown,
  Share2,
  Search,
  Users,
  CreditCard,
  Zap,
  Calculator,
  Info,
  MapPin,
  Phone,
  MessageCircle,
  type LucideIcon,
} from 'lucide-vue-next';

defineOptions({ name: 'AppIcon' });

const props = defineProps({
  name: { type: String, default: '' },
  size: { type: [Number, String], default: 22 },
  color: { type: String, default: '#2196F3' },
});

/** Alias de la app → componente Lucide (mismos glifos que los paths anteriores). */
const ICONOS: Record<string, LucideIcon> = {
  store: Store,
  home: Home,
  cart: ShoppingCart,
  bag: ShoppingBag,
  wallet: Wallet,
  tag: Tag,
  package: Package,
  book: BookOpen,
  dollar: DollarSign,
  chart: ChartColumn,
  trend: TrendingUp,
  calendar: Calendar,
  list: List,
  file: File,
  check: Check,
  x: X,
  trash: Trash2,
  edit: SquarePen,
  refresh: RefreshCw,
  plus: Plus,
  menu: Menu,
  settings: Settings,
  moon: Moon,
  sun: Sun,
  lock: Lock,
  download: Download,
  upload: Upload,
  alert: CircleAlert,
  diamond: Diamond,
  chevron: ChevronDown,
  share: Share2,
  search: Search,
  users: Users,
  'credit-card': CreditCard,
  zap: Zap,
  calculator: Calculator,
  info: Info, // antes no existía en PATHS y renderizaba vacío
  'map-pin': MapPin,
  phone: Phone,
  'message-circle': MessageCircle,
};

const sRem = computed(() => (parseInt(String(props.size)) || 22) / 15 + 'rem');
const comp = computed(() => ICONOS[props.name] || null);
</script>
