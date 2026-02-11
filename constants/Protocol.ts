export const UDP_DISCOVERY_PORT = 8134;
export const HTTP_PORT = 80;
export const WS_PORT = 81;
export const CHUNK_SIZE = 4 * 1024; // 4KB — small enough for ESP32 WebSocket frame buffer
export const DISCOVERY_TIMEOUT_MS = 5000;
export const DISCOVERY_REGEX = /crosspoint \(on (.+?)\);(\d+)/;
export const DEFAULT_UPLOAD_PATH = '/';
export const DEFAULT_CLIP_UPLOAD_PATH = '/Articles';
export const CHUNKS_PER_WINDOW = 16; // 16 × 4KB = 64KB = one PROGRESS interval
export const PROGRESS_ACK_TIMEOUT_MS = 5000;
export const STATUS_POLL_INTERVAL_MS = 10000;
export const REQUEST_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;
export const UPLOAD_TIMEOUT_MS = 30_000;
