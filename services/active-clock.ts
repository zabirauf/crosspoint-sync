import { AppState } from 'react-native';

/**
 * Milliseconds of time the app has spent outside the background. Deadlines
 * measured with this pause while the app is suspended: the hidden plugin
 * runner cannot claim jobs then, and timers do not fire on schedule.
 */
let backgroundSince: number | null = null;
let backgroundTotal = 0;

function onAppState(state: string | null | undefined) {
  const now = Date.now();
  if (state === 'background') {
    if (backgroundSince === null) backgroundSince = now;
  } else if (backgroundSince !== null) {
    backgroundTotal += now - backgroundSince;
    backgroundSince = null;
  }
}

// Absent in Node test harnesses that stub react-native.
if (AppState && typeof AppState.addEventListener === 'function') {
  onAppState(AppState.currentState);
  AppState.addEventListener('change', onAppState);
}

export function activeNow(): number {
  const now = Date.now();
  const paused = backgroundTotal + (backgroundSince === null ? 0 : now - backgroundSince);
  return now - paused;
}
