import { create } from 'zustand';

/**
 * Keeps the reader's headless plugin page (`/plugins-run`) open in a hidden
 * WebView while plugin jobs are outstanding. CrossPoint executes queued plugin
 * jobs only while some page hosting the plugin is open; the page claims each
 * job, runs the plugin's registered action and posts the result back.
 */
interface PluginRunnerState {
  url: string | null;
  /** Bumped on every acquire so a reused URL still remounts a failed page. */
  sessionId: number;
  users: number;
  loadError: string | null;
  acquire: (url: string) => void;
  release: () => void;
  reportLoadError: (message: string) => void;
}

export const usePluginRunnerStore = create<PluginRunnerState>((set, get) => ({
  url: null,
  sessionId: 0,
  users: 0,
  loadError: null,
  acquire: (url) => {
    const { users, url: current, sessionId } = get();
    if (users > 0 && current === url) {
      set({ users: users + 1 });
      return;
    }
    set({ url, users: users + 1, loadError: null, sessionId: sessionId + 1 });
  },
  release: () => {
    const users = Math.max(0, get().users - 1);
    set(users === 0 ? { users, url: null, loadError: null } : { users });
  },
  reportLoadError: (message) => set({ loadError: message }),
}));
