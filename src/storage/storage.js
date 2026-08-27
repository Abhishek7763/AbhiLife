import { Capacitor } from '@capacitor/core';

const STORAGE_MODE = Object.freeze({
  WEB_PREVIEW: 'web-preview',
  ANDROID_NATIVE: 'android-native'
});

export function getStorageMode() {
  return Capacitor.isNativePlatform()
    ? STORAGE_MODE.ANDROID_NATIVE
    : STORAGE_MODE.WEB_PREVIEW;
}

export function assertNoBrowserPersistence() {
  if (getStorageMode() === STORAGE_MODE.WEB_PREVIEW) {
    return {
      persistent: false,
      message: 'Web preview does not persist personal data. Native AbhiLife storage uses the user-owned Documents/AbhiLife folder.'
    };
  }

  return {
    persistent: true,
    message: 'Android SAF storage is active with persistent access to the selected AbhiLife folder.'
  };
}

export { STORAGE_MODE };
