import { useState, useCallback } from 'react';
import { validateDeviceIP } from '@/services/device-discovery';
import { useDeviceStore } from '@/stores/device-store';
import { log } from '@/services/logger';

export function useDeviceDiscovery() {
  const [error, setError] = useState<string | null>(null);
  const { connectDevice, updateDeviceStatus, setConnectionStatus } = useDeviceStore();

  const connectManualIP = useCallback(
    async (ip: string) => {
      log('connection', `Manual connect to ${ip}`);
      setConnectionStatus('connecting');
      setError(null);
      try {
        const result = await validateDeviceIP(ip);
        if (result) {
          log('connection', `Manual connect succeeded`);
          connectDevice(result.device);
          updateDeviceStatus(result.status);
        } else {
          log('connection', `Manual connect failed: no device at ${ip}`);
          setError('No device found at this address');
          setConnectionStatus('error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        log('connection', `Manual connect failed: ${msg}`);
        setError(msg);
        setConnectionStatus('error');
      }
    },
    [connectDevice, updateDeviceStatus, setConnectionStatus],
  );

  return { error, connectManualIP };
}
