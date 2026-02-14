import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

interface MulticastLockModule {
  acquire(): void;
  release(): void;
}

const mod = Platform.OS === 'android'
  ? requireNativeModule<MulticastLockModule>('MulticastLock')
  : null;

export function acquireMulticastLock(): void {
  mod?.acquire();
}

export function releaseMulticastLock(): void {
  mod?.release();
}
