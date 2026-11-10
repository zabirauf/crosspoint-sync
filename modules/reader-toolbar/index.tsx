import { Platform, type NativeSyntheticEvent } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';

// A fixed API-availability decision, never a device or window-size check.
// Keep the existing navigation in older builds without this local module.
export const usesNativeReaderBars = Platform.OS === 'ios' &&
  Number.parseFloat(String(Platform.Version)) >= 26 &&
  requireOptionalNativeModule('ReaderToolbar') !== null;

export type ReaderToolbarAction = 'upload' | 'folder' | 'sleep' | 'queue';

interface ReaderToolbarProps {
  enabled?: boolean;
  connected: boolean;
  needsAttention: boolean;
  onAction: (event: NativeSyntheticEvent<{ action: ReaderToolbarAction }>) => void;
  onNavigationInsetChange?: (event: NativeSyntheticEvent<{ bottom: number }>) => void;
  style?: { width: number; height: number };
}

export const ReaderToolbar = usesNativeReaderBars
  ? requireNativeViewManager<ReaderToolbarProps>('ReaderToolbar')
  : () => null;
