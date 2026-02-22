import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FeedbackState {
  totalSuccessfulUploads: number;
  firstSuccessfulUploadAt: number | null;
  lastFeedbackRequestAt: number | null;
  feedbackRequestCount: number;
  feedbackDismissedPermanently: boolean;

  recordSuccessfulUpload: () => void;
  recordFeedbackRequest: () => void;
  dismissFeedbackPermanently: () => void;
}

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set, get) => ({
      totalSuccessfulUploads: 0,
      firstSuccessfulUploadAt: null,
      lastFeedbackRequestAt: null,
      feedbackRequestCount: 0,
      feedbackDismissedPermanently: false,

      recordSuccessfulUpload: () =>
        set((state) => ({
          totalSuccessfulUploads: state.totalSuccessfulUploads + 1,
          firstSuccessfulUploadAt: state.firstSuccessfulUploadAt ?? Date.now(),
        })),

      recordFeedbackRequest: () =>
        set((state) => ({
          lastFeedbackRequestAt: Date.now(),
          feedbackRequestCount: state.feedbackRequestCount + 1,
        })),

      dismissFeedbackPermanently: () =>
        set({ feedbackDismissedPermanently: true }),
    }),
    {
      name: 'crosspointsync-feedback',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
