import { Capacitor, registerPlugin } from '@capacitor/core';

export const AbhiLifeStoragePlugin = registerPlugin('AbhiLifeStorage');

export function isNativeStorageAvailable() {
  return Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
    && Capacitor.isPluginAvailable('AbhiLifeStorage');
}

function requireAndroid() {
  if (!isNativeStorageAvailable()) {
    throw new Error('AbhiLife native storage is unavailable. Web preview never persists personal data.');
  }
}

export const nativeStorageBridge = Object.freeze({
  async chooseRoot() {
    requireAndroid();
    return AbhiLifeStoragePlugin.chooseRoot();
  },

  async getRootStatus() {
    requireAndroid();
    return AbhiLifeStoragePlugin.getRootStatus();
  },

  async releaseRoot() {
    requireAndroid();
    return AbhiLifeStoragePlugin.releaseRoot();
  },

  async ensureDirectory(path) {
    requireAndroid();
    return AbhiLifeStoragePlugin.ensureDirectory({ path });
  },

  async exists(path) {
    requireAndroid();
    const result = await AbhiLifeStoragePlugin.exists({ path });
    return Boolean(result.exists);
  },

  async readText(path) {
    requireAndroid();
    const result = await AbhiLifeStoragePlugin.readText({ path });
    return result.data;
  },

  async writeTextAtomic(path, data) {
    requireAndroid();
    return AbhiLifeStoragePlugin.writeTextAtomic({ path, data });
  },

  async list(path = '') {
    requireAndroid();
    const result = await AbhiLifeStoragePlugin.list({ path });
    return result.entries;
  },

  async deletePath(path) {
    requireAndroid();
    return AbhiLifeStoragePlugin.deletePath({ path });
  }
});
