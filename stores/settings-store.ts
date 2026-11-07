import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_UPLOAD_PATH, DEFAULT_CLIP_UPLOAD_PATH } from '@/constants/Protocol';

interface SettingsState {
  defaultUploadPath: string;
  clipUploadPath: string;
  debugLogsEnabled: boolean;
  setDefaultUploadPath: (path: string) => void;
  setClipUploadPath: (path: string) => void;
  setDebugLogsEnabled: (enabled: boolean) => void;
}

// Track completion as well as success: Zustand's onFinishHydration only fires
// on success, so it cannot release callers after a storage/JSON read failure.
let settingsHydration: Promise<boolean> | undefined;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultUploadPath: DEFAULT_UPLOAD_PATH,
      clipUploadPath: DEFAULT_CLIP_UPLOAD_PATH,
      debugLogsEnabled: false,

      setDefaultUploadPath: (path) => set({ defaultUploadPath: path }),
      setClipUploadPath: (path) => set({ clipUploadPath: path }),
      setDebugLogsEnabled: (enabled) => set({ debugLogsEnabled: enabled }),
    }),
    {
      name: 'crosspointsync-settings',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => {
        let finishHydration!: (success: boolean) => void;
        settingsHydration = new Promise<boolean>((resolve) => {
          finishHydration = resolve;
        });
        return (state, error) => {
          settingsHydration = undefined;
          finishHydration(state !== undefined && error === undefined);
        };
      },
    },
  ),
);

export async function waitForSettingsHydration(): Promise<boolean> {
  if (useSettingsStore.persist.hasHydrated()) return true;

  // Reuse the startup read; retry a failed read on the next import attempt.
  if (!settingsHydration) {
    void useSettingsStore.persist.rehydrate();
  }
  return settingsHydration ?? useSettingsStore.persist.hasHydrated();
}
