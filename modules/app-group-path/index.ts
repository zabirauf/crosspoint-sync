import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

interface AppGroupPathModule {
  getPath(groupIdentifier: string): string | null;
}

const mod = Platform.OS === 'ios'
  ? requireNativeModule<AppGroupPathModule>('AppGroupPath')
  : null;

export function getAppGroupPath(groupIdentifier: string): string | null {
  return mod?.getPath(groupIdentifier) ?? null;
}
