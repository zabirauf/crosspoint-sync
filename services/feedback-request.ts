import { AppState } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { useFeedbackStore } from '@/stores/feedback-store';
import { useUploadStore } from '@/stores/upload-store';
import { log } from './logger';

// Milestone upload counts at which we consider showing a review prompt
const MILESTONE_THRESHOLDS = [3, 10, 25];

// Minimum days since first upload before asking
const MIN_DAYS_SINCE_FIRST_UPLOAD = 3;

// Minimum days between feedback requests
const COOLDOWN_DAYS = 120;

// Maximum number of times we'll ever ask
const MAX_REQUESTS = 2;

// Delay after queue drains before showing prompt (ms)
const PROMPT_DELAY_MS = 2500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

let lastMilestoneReached = 0;

/**
 * Called when a single upload job completes successfully.
 * Tracks the upload count and checks if a new milestone was crossed.
 */
export function recordUploadSuccess(): void {
  const store = useFeedbackStore.getState();
  const prevCount = store.totalSuccessfulUploads;
  store.recordSuccessfulUpload();
  const newCount = prevCount + 1;

  // Check if we just crossed a milestone threshold
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (prevCount < threshold && newCount >= threshold) {
      lastMilestoneReached = threshold;
      break;
    }
  }
}

/**
 * Called when the upload queue drains (no more pending or uploading jobs).
 * If a milestone was recently crossed and all conditions are met, schedules
 * a review prompt after a short delay.
 */
export function onQueueDrained(): void {
  if (lastMilestoneReached === 0) return;

  const milestoneToCheck = lastMilestoneReached;
  lastMilestoneReached = 0;

  if (!shouldRequestFeedback(milestoneToCheck)) return;

  // Small delay so it doesn't pop up the instant the last upload finishes
  setTimeout(() => {
    // Re-check: make sure the queue is still empty and app is foregrounded
    const { jobs } = useUploadStore.getState();
    const hasPendingWork = jobs.some(
      (j) => j.status === 'pending' || j.status === 'uploading',
    );
    if (hasPendingWork) return;
    if (AppState.currentState !== 'active') return;

    requestReview();
  }, PROMPT_DELAY_MS);
}

function shouldRequestFeedback(milestone: number): boolean {
  const {
    totalSuccessfulUploads,
    firstSuccessfulUploadAt,
    lastFeedbackRequestAt,
    feedbackRequestCount,
    feedbackDismissedPermanently,
  } = useFeedbackStore.getState();

  // User opted out permanently
  if (feedbackDismissedPermanently) return false;

  // Already asked enough times
  if (feedbackRequestCount >= MAX_REQUESTS) return false;

  // Must have actually reached the milestone
  if (totalSuccessfulUploads < milestone) return false;

  // Must have been using the app for a minimum period
  if (!firstSuccessfulUploadAt) return false;
  const daysSinceFirst = (Date.now() - firstSuccessfulUploadAt) / MS_PER_DAY;
  if (daysSinceFirst < MIN_DAYS_SINCE_FIRST_UPLOAD) return false;

  // Cooldown between requests
  if (lastFeedbackRequestAt) {
    const daysSinceLastRequest =
      (Date.now() - lastFeedbackRequestAt) / MS_PER_DAY;
    if (daysSinceLastRequest < COOLDOWN_DAYS) return false;
  }

  // App must be in foreground
  if (AppState.currentState !== 'active') return false;

  return true;
}

async function requestReview(): Promise<void> {
  try {
    const canReview = await StoreReview.hasAction();
    if (!canReview) {
      log('queue', 'Store review not available on this platform');
      return;
    }

    log('queue', 'Requesting store review');
    useFeedbackStore.getState().recordFeedbackRequest();
    await StoreReview.requestReview();
  } catch (err) {
    log(
      'queue',
      `Store review request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
