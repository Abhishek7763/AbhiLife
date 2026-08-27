const STORAGE_MODE = Object.freeze({
  WEB_PREVIEW: 'web-preview',
  ANDROID_NATIVE: 'android-native'
});

export function getStorageMode() {
  const isNative = Boolean(globalThis?.Capacitor?.isNativePlatform?.());
  return isNative ? STORAGE_MODE.ANDROID_NATIVE : STORAGE_MODE.WEB_PREVIEW;
}

export function assertNoBrowserPersistence() {
  if (getStorageMode() === STORAGE_MODE.WEB_PREVIEW) {
    return {
      persistent: false,
      message: 'Web preview does not persist personal data. Native AbhiLife storage will use the user-owned Documents/AbhiLife folder.'
    };
  }

  return {
    persistent: true,
    message: 'Native storage adapter pending Phase 3 implementation.'
  };
}

export { STORAGE_MODE };
