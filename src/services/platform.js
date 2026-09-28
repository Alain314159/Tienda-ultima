import { Capacitor } from '@capacitor/core';

export const esNativo = () => Capacitor.isNativePlatform();
export const esWeb = () => !Capacitor.isNativePlatform();
export const plataforma = () => Capacitor.getPlatform(); // 'web' | 'android' | 'ios'
