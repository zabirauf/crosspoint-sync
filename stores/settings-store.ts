import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_UPLOAD_PATH, DEFAULT_CLIP_UPLOAD_PATH, DEFAULT_PROTECTED_UPLOAD_PATH } from '@/constants/Protocol';
import { isAcsmFile } from '@/constants/FileFormats';

interface SettingsState {
  defaultUploadPath: string;
  clipUploadPath: string;
  protectedUploadPath: string;
  debugLogsEnabled: boolean;
  setDefaultUploadPath: (path: string) => void;
  setClipUploadPath: (path: string) => void;
  setProtectedUploadPath: (path: string) => void;
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
      protectedUploadPath: DEFAULT_PROTECTED_UPLOAD_PATH,
      debugLogsEnabled: false,

      setDefaultUploadPath: (path) => set({ defaultUploadPath: path }),
      setClipUploadPath: (path) => set({ clipUploadPath: path }),
      setProtectedUploadPath: (path) => set({ protectedUploadPath: path }),
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

/**
 * Destination for a file that arrives without a folder chosen by the user
 * (shares, or Add Books from the queue): .acsm files go to their own folder,
 * where the reader also fetches their books. Everything else uses `fallback`.
 */
export function defaultDestinationFor(fileName: string, fallback = useSettingsStore.getState().defaultUploadPath): string {
  return isAcsmFile(fileName) ? useSettingsStore.getState().protectedUploadPath : fallback;
}

export async function waitForSettingsHydration(): Promise<boolean> {
  if (useSettingsStore.persist.hasHydrated()) return true;

  // Reuse the startup read; retry a failed read on the next import attempt.
  if (!settingsHydration) {
    void useSettingsStore.persist.rehydrate();
  }
  return settingsHydration ?? useSettingsStore.persist.hasHydrated();
}
