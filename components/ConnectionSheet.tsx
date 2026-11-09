import { useEffect, useRef } from 'react';
import { AdaptiveSheet } from '@/components/AdaptiveSheet';
import { ConnectionContent } from '@/components/ConnectionContent';
import { useDeviceStore } from '@/stores/device-store';

const CONNECTION_SHEET_HEIGHT = 620;
const CONNECTED_DISMISS_DELAY_MS = 600;

interface ConnectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionSheet({ open, onOpenChange }: ConnectionSheetProps) {
  const isConnected = useDeviceStore((state) => state.connectionStatus === 'connected');
  // Auto-close only on fresh connection (transition from disconnected → connected)
  const wasConnected = useRef(isConnected);

  useEffect(() => {
    if (isConnected && !wasConnected.current && open) {
      const timer = setTimeout(() => onOpenChange(false), CONNECTED_DISMISS_DELAY_MS);
      wasConnected.current = true;
      return () => clearTimeout(timer);
    }
    wasConnected.current = isConnected;
  }, [isConnected, open, onOpenChange]);

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange} testID="Connection.Sheet" height={CONNECTION_SHEET_HEIGHT} padding={16}>
      <ConnectionContent onClose={() => onOpenChange(false)} />
    </AdaptiveSheet>
  );
}
