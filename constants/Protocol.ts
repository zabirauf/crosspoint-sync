import { Platform } from 'react-native';

export const HTTP_PORT = 80;
export const WS_PORT = 81;
export const CHUNK_SIZE = 4 * 1024; // 4KB — small enough for ESP32 WebSocket frame buffer
export const DEFAULT_UPLOAD_PATH = '/';
export const DEFAULT_CLIP_UPLOAD_PATH = '/Articles';
// .acsm files, and the protected books the reader fetches beside them.
export const DEFAULT_PROTECTED_UPLOAD_PATH = '/Protected Content';
export const DEFAULT_DEVICE_ADDRESS = 'crosspoint.local';
export const CHUNKS_PER_WINDOW = 16; // 16 × 4KB = 64KB = one PROGRESS interval
export const PROGRESS_ACK_TIMEOUT_MS = 5000;
export const STATUS_POLL_INTERVAL_MS = 10000;
// Android WiFi stack adds 1-3s latency jitter; 8s gives headroom for ESP32's 2-4s responses
export const REQUEST_TIMEOUT_MS = Platform.OS === 'android' ? 8000 : 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;
export const UPLOAD_TIMEOUT_MS = 30_000;
export const DEVICE_RECOVERY_DELAY_MS = 2000;
export const ENSURE_PATH_MAX_RETRIES = 2;
export const ENSURE_PATH_RETRY_DELAY_MS = 3000;
export const SLEEP_UPLOAD_PATH = '/sleep';

// SD-plugin job queue (firmware 2.0.0+). See docs/sd-plugins.md in the firmware.
export const PROTECTED_CONTENT_PLUGIN = 'protected-content';
export const PROTECTED_CONTENT_FULFILL_ACTION = 'fulfill';
export const PLUGIN_RUNNER_PATH = '/plugins-run';
// Job args must serialize to fewer than 192 bytes of JSON.
export const PLUGIN_JOB_ARGS_MAX_BYTES = 191;
export const PLUGIN_JOB_POLL_INTERVAL_MS = 2000;
// The runner page needs a few claim cycles (2.5s each) before a job starts.
export const PLUGIN_JOB_START_TIMEOUT_MS = 45_000;
// Fulfillment streams the whole book from the provider onto the SD card.
export const PLUGIN_JOB_TIMEOUT_MS = 6 * 60_000;
