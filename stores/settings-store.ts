import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_UPLOAD_PATH, DEFAULT_CLIP_UPLOAD_PATH } from '@/constants/Protocol';

interface SettingsState {
  defaultUploadPath: string;
  clipUploadPath: string;
  preferredFormat: 'EPUB' | 'PDF';
  debugLogsEnabled: boolean;
  setDefaultUploadPath: (path: string) => void;
  setClipUploadPath: (path: string) => void;
  setPreferredFormat: (format: 'EPUB' | 'PDF') => void;
  setDebugLogsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultUploadPath: DEFAULT_UPLOAD_PATH,
      clipUploadPath: DEFAULT_CLIP_UPLOAD_PATH,
      preferredFormat: 'EPUB',
      debugLogsEnabled: false,

      setDefaultUploadPath: (path) => set({ defaultUploadPath: path }),
      setClipUploadPath: (path) => set({ clipUploadPath: path }),
      setPreferredFormat: (format) => set({ preferredFormat: format }),
      setDebugLogsEnabled: (enabled) => set({ debugLogsEnabled: enabled }),
    }),
    {
      name: 'crosspointsync-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
