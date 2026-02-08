import { requireNativeModule } from 'expo-modules-core';

interface AppGroupPathModule {
  getPath(groupIdentifier: string): string | null;
}

const mod = requireNativeModule<AppGroupPathModule>('AppGroupPath');

export function getAppGroupPath(groupIdentifier: string): string | null {
  return mod.getPath(groupIdentifier);
}
