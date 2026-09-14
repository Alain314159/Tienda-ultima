import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({
    tema: 'light',
    settingsOpen: false,
    currentSection: 'dashboard',
    toast: { show: false, msg: '', type: 'ok' }
  }),
  actions: {
    toggleTema() {
      this.tema = this.tema === 'light' ? 'dark' : 'light';
    },
    showToast(msg, type = 'ok') {
      this.toast = { show: true, msg, type };
      setTimeout(() => { this.toast.show = false; }, 3000);
    }
  }
});
