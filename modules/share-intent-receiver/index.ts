import { Platform } from 'react-native';
import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface SharedItem {
  type: 'file' | 'text';
  uri?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  text?: string;
}

interface ShareIntentReceiverEvents {
  onShareIntent: (event: { items: SharedItem[] }) => void;
}

interface ShareIntentReceiverModule {
  getSharedItems(): SharedItem[];
  clearIntent(): void;
  addListener<K extends keyof ShareIntentReceiverEvents>(
    eventName: K,
    listener: ShareIntentReceiverEvents[K],
  ): EventSubscription;
}

const mod = Platform.OS === 'android'
  ? requireNativeModule<ShareIntentReceiverModule>('ShareIntentReceiver')
  : null;

export function getSharedItems(): SharedItem[] {
  return mod?.getSharedItems() ?? [];
}

export function clearIntent(): void {
  mod?.clearIntent();
}

export function addShareIntentListener(
  callback: (event: { items: SharedItem[] }) => void,
): EventSubscription | null {
  return mod?.addListener('onShareIntent', callback) ?? null;
}
