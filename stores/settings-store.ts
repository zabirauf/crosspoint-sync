import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_UPLOAD_PATH, DEFAULT_CLIP_UPLOAD_PATH } from '@/constants/Protocol';

interface SettingsState {
  defaultUploadPath: string;
  clipUploadPath: string;
  debugLogsEnabled: boolean;
  deviceScanEnabled: boolean;
  setDefaultUploadPath: (path: string) => void;
  setClipUploadPath: (path: string) => void;
  setDebugLogsEnabled: (enabled: boolean) => void;
  setDeviceScanEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultUploadPath: DEFAULT_UPLOAD_PATH,
      clipUploadPath: DEFAULT_CLIP_UPLOAD_PATH,
      debugLogsEnabled: false,
      deviceScanEnabled: false,

      setDefaultUploadPath: (path) => set({ defaultUploadPath: path }),
      setClipUploadPath: (path) => set({ clipUploadPath: path }),
      setDebugLogsEnabled: (enabled) => set({ debugLogsEnabled: enabled }),
      setDeviceScanEnabled: (enabled) => set({ deviceScanEnabled: enabled }),
    }),
    {
      name: 'crosspointsync-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
