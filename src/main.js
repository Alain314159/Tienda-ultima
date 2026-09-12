import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

const app = createApp(App);

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info);
};

app.mount('#app');
