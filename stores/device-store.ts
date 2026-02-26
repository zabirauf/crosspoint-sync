import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceInfo, DeviceStatus, ConnectionStatus } from '@/types/device';
import { DEFAULT_DEVICE_ADDRESS, HTTP_PORT } from '@/constants/Protocol';
import { log } from '@/services/logger';

interface DeviceState {
  connectionStatus: ConnectionStatus;
  connectedDevice: DeviceInfo | null;
  deviceStatus: DeviceStatus | null;
  lastDeviceIp: string | null;
  error: string | null;
  connectDevice: (device: DeviceInfo) => void;
  disconnect: () => void;
  updateDeviceStatus: (status: DeviceStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set) => ({
      connectionStatus: 'disconnected',
      connectedDevice: null,
      deviceStatus: null,
      lastDeviceIp: DEFAULT_DEVICE_ADDRESS,
      error: null,

      connectDevice: (device) => {
        log('store', `Connected: ${device.hostname} (${device.ip}:${device.httpPort})`);
        const lastDeviceIp = device.httpPort !== HTTP_PORT
          ? `${device.ip}:${device.httpPort}`
          : device.ip;
        set({
          connectionStatus: 'connected',
          connectedDevice: device,
          lastDeviceIp,
          error: null,
        });
      },

      disconnect: () => {
        log('store', 'Disconnected');
        set({
          connectionStatus: 'disconnected',
          connectedDevice: null,
          deviceStatus: null,
          error: null,
        });
      },

      updateDeviceStatus: (status) =>
        set({ deviceStatus: status }),

      setConnectionStatus: (status) => {
        log('store', `Status → ${status}`);
        set({ connectionStatus: status });
      },

      setError: (error) => {
        log('store', error ? `Error: ${error}` : 'Error cleared');
        set({
          connectionStatus: error ? 'error' : 'disconnected',
          error,
        });
      },
    }),
    {
      name: 'crosspointsync-device',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ lastDeviceIp: state.lastDeviceIp }),
    },
  ),
);
