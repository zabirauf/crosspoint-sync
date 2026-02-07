import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceInfo, DeviceStatus, ConnectionStatus } from '@/types/device';

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
      lastDeviceIp: null,
      error: null,

      connectDevice: (device) =>
        set({
          connectionStatus: 'connected',
          connectedDevice: device,
          lastDeviceIp: device.ip,
          error: null,
        }),

      disconnect: () =>
        set({
          connectionStatus: 'disconnected',
          connectedDevice: null,
          deviceStatus: null,
          error: null,
        }),

      updateDeviceStatus: (status) =>
        set({ deviceStatus: status }),

      setConnectionStatus: (status) =>
        set({ connectionStatus: status }),

      setError: (error) =>
        set({
          connectionStatus: error ? 'error' : 'disconnected',
          error,
        }),
    }),
    {
      name: 'zync-device',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ lastDeviceIp: state.lastDeviceIp }),
    },
  ),
);
