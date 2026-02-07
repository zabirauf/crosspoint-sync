import { useState, useCallback, useRef } from 'react';
import { DeviceInfo } from '@/types/device';
import { discoverDevices, validateDeviceIP } from '@/services/device-discovery';
import { getDeviceStatus } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';

export function useDeviceDiscovery() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { connectDevice, setConnectionStatus } = useDeviceStore();

  const startScan = useCallback(() => {
    setDevices([]);
    setError(null);
    setIsScanning(true);
    setConnectionStatus('scanning');

    cancelRef.current = discoverDevices(
      (device) => {
        setDevices((prev) => {
          if (prev.some((d) => d.ip === device.ip)) return prev;
          return [...prev, device];
        });
      },
      () => {
        setIsScanning(false);
        setConnectionStatus('disconnected');
        cancelRef.current = null;
      },
      (err) => {
        setIsScanning(false);
        setError(err.message);
        setConnectionStatus('error');
        cancelRef.current = null;
      },
    );
  }, [setConnectionStatus]);

  const stopScan = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setIsScanning(false);
    setConnectionStatus('disconnected');
  }, [setConnectionStatus]);

  const connectToDevice = useCallback(
    async (device: DeviceInfo) => {
      setConnectionStatus('connecting');
      setError(null);
      try {
        await getDeviceStatus(device.ip);
        connectDevice(device);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setConnectionStatus('error');
      }
    },
    [connectDevice, setConnectionStatus],
  );

  const connectManualIP = useCallback(
    async (ip: string) => {
      setConnectionStatus('connecting');
      setError(null);
      try {
        const device = await validateDeviceIP(ip);
        if (device) {
          connectDevice(device);
        } else {
          setError('No device found at this IP address');
          setConnectionStatus('error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setConnectionStatus('error');
      }
    },
    [connectDevice, setConnectionStatus],
  );

  return {
    devices,
    isScanning,
    error,
    startScan,
    stopScan,
    connectToDevice,
    connectManualIP,
  };
}
