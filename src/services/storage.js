import { Preferences } from '@capacitor/preferences';
import { esNativo } from './platform.js';

export const Storage = {
  async get(key) {
    if (esNativo()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  },

  async set(key, value) {
    if (esNativo()) {
      await Preferences.set({ key, value: String(value) });
    } else {
      localStorage.setItem(key, String(value));
    }
  },

  async remove(key) {
    if (esNativo()) {
      await Preferences.remove({ key });
    } else {
      localStorage.removeItem(key);
    }
  },

  async getJSON(key) {
    const raw = await this.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  async setJSON(key, value) {
    await this.set(key, JSON.stringify(value));
  }
};
