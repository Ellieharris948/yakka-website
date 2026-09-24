import AsyncStorage from '@react-native-async-storage/async-storage';

const REMEMBER_SESSION_KEY = 'yakka.remember-session';
const isWebBrowser = typeof window !== 'undefined' && !!window.sessionStorage && !!window.localStorage;

export function setRememberSession(remember: boolean) {
  if (!isWebBrowser) return;
  window.localStorage.setItem(REMEMBER_SESSION_KEY, remember ? '1' : '0');
}

const webAuthStorage = {
  async getItem(key: string) {
    const persistent = window.localStorage.getItem(REMEMBER_SESSION_KEY) === '1';
    return persistent ? window.localStorage.getItem(key) : window.sessionStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    const persistent = window.localStorage.getItem(REMEMBER_SESSION_KEY) === '1';
    const destination = persistent ? window.localStorage : window.sessionStorage;
    const alternate = persistent ? window.sessionStorage : window.localStorage;
    destination.setItem(key, value);
    alternate.removeItem(key);
  },
  async removeItem(key: string) {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  },
};

export const authStorage = isWebBrowser ? webAuthStorage : AsyncStorage;
