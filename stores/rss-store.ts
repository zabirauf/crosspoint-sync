import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RssFeed } from '@/types/rss';

interface RssState {
  feeds: RssFeed[];
  /** Ids of feeds currently being checked. Transient — not persisted. */
  checkingFeedIds: string[];

  addFeed: (feed: Pick<RssFeed, 'url' | 'title'> & Partial<RssFeed>) => string;
  removeFeed: (id: string) => void;
  updateFeed: (id: string, patch: Partial<Omit<RssFeed, 'id'>>) => void;
  setFeedEnabled: (id: string, enabled: boolean) => void;
  setFeedKeywords: (id: string, keywords: string[]) => void;
  setFeedFolder: (id: string, folderName: string) => void;
  setChecking: (id: string, checking: boolean) => void;

  getFeed: (id: string) => RssFeed | undefined;
  getEnabledFeeds: () => RssFeed[];
  hasFeedUrl: (url: string) => boolean;
}

/**
 * Turns a feed title into a device-safe folder name. The X4 lists files over a plain
 * HTTP/WebSocket API, so keep folder names to characters that survive a URL path and an
 * FAT-style filesystem: ASCII alphanumerics and dashes only.
 */
export function toFolderName(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .slice(0, 40)
    // Trim after truncating, so a cut mid-word can't leave a trailing dash.
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Trailing slashes and case in the host shouldn't create duplicate subscriptions. */
function normalizeFeedUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

export const useRssStore = create<RssState>()(
  persist(
    (set, get) => ({
      feeds: [],
      checkingFeedIds: [],

      addFeed: (feed) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        set((state) => ({
          feeds: [
            ...state.feeds,
            {
              keywords: [],
              lastSeenItemId: null,
              enabled: true,
              lastCheckedAt: null,
              lastError: null,
              folderName: toFolderName(feed.title),
              ...feed,
              id,
              url: normalizeFeedUrl(feed.url),
              addedAt: Date.now(),
            },
          ],
        }));
        return id;
      },

      removeFeed: (id) =>
        set((state) => ({
          feeds: state.feeds.filter((f) => f.id !== id),
          checkingFeedIds: state.checkingFeedIds.filter((c) => c !== id),
        })),

      updateFeed: (id, patch) =>
        set((state) => ({
          feeds: state.feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      setFeedEnabled: (id, enabled) =>
        set((state) => ({
          feeds: state.feeds.map((f) => (f.id === id ? { ...f, enabled } : f)),
        })),

      setFeedKeywords: (id, keywords) =>
        set((state) => ({
          feeds: state.feeds.map((f) => (f.id === id ? { ...f, keywords } : f)),
        })),

      setFeedFolder: (id, folderName) =>
        set((state) => ({
          feeds: state.feeds.map((f) =>
            f.id === id ? { ...f, folderName: toFolderName(folderName) } : f,
          ),
        })),

      setChecking: (id, checking) =>
        set((state) => ({
          checkingFeedIds: checking
            ? state.checkingFeedIds.includes(id)
              ? state.checkingFeedIds
              : [...state.checkingFeedIds, id]
            : state.checkingFeedIds.filter((c) => c !== id),
        })),

      getFeed: (id) => get().feeds.find((f) => f.id === id),
      getEnabledFeeds: () => get().feeds.filter((f) => f.enabled),
      hasFeedUrl: (url) => {
        const normalized = normalizeFeedUrl(url);
        return get().feeds.some((f) => f.url === normalized);
      },
    }),
    {
      name: 'crosspointsync-rss',
      storage: createJSONStorage(() => AsyncStorage),
      // checkingFeedIds is in-flight state; a check never survives a restart.
      partialize: (state) => ({ feeds: state.feeds }),
      version: 1,
      // v0 feeds predate per-feed folders; derive one from the title so an existing
      // subscription doesn't end up writing to "/Rss/undefined".
      migrate: (persisted, version) => {
        const state = persisted as { feeds?: RssFeed[] } | undefined;
        if (version < 1 && state?.feeds) {
          state.feeds = state.feeds.map((f) => ({
            ...f,
            folderName: f.folderName ?? toFolderName(f.title),
          }));
        }
        return state as RssState;
      },
    },
  ),
);

export { normalizeFeedUrl };
