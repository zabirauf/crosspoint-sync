import { useState, useCallback, useRef } from 'react';
import { DeviceInfo } from '@/types/device';
import { discoverDevices, validateDeviceIP } from '@/services/device-discovery';
import { getDeviceStatus } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';
import { log } from '@/services/logger';

export function useDeviceDiscovery() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { connectDevice, setConnectionStatus } = useDeviceStore();

  const startScan = useCallback(() => {
    log('discovery', 'Scan started');
    setDevices([]);
    setError(null);
    setIsScanning(true);
    setConnectionStatus('scanning');

    cancelRef.current = discoverDevices(
      (device) => {
        log('discovery', `Scan found: ${device.hostname} (${device.ip})`);
        setDevices((prev) => {
          if (prev.some((d) => d.ip === device.ip)) return prev;
          return [...prev, device];
        });
      },
      () => {
        log('discovery', 'Scan ended');
        setIsScanning(false);
        setConnectionStatus('disconnected');
        cancelRef.current = null;
      },
      (err) => {
        log('discovery', `Scan ended`);
        setIsScanning(false);
        setError(err.message);
        setConnectionStatus('error');
        cancelRef.current = null;
      },
    );
  }, [setConnectionStatus]);

  const stopScan = useCallback(() => {
    log('discovery', 'Scan stopped by user');
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setIsScanning(false);
    setConnectionStatus('disconnected');
  }, [setConnectionStatus]);

  const connectToDevice = useCallback(
    async (device: DeviceInfo) => {
      log('connection', `Connecting to ${device.hostname} (${device.ip})`);
      setConnectionStatus('connecting');
      setError(null);
      try {
        await getDeviceStatus(device.ip);
        log('connection', `Connected to ${device.hostname}`);
        connectDevice(device);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        log('connection', `Connection failed: ${msg}`);
        setError(msg);
        setConnectionStatus('error');
      }
    },
    [connectDevice, setConnectionStatus],
  );

  const connectManualIP = useCallback(
    async (ip: string) => {
      log('connection', `Manual connect to ${ip}`);
      setConnectionStatus('connecting');
      setError(null);
      try {
        const device = await validateDeviceIP(ip);
        if (device) {
          log('connection', `Manual connect succeeded`);
          connectDevice(device);
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
