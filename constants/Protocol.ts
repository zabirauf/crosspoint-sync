export const UDP_DISCOVERY_PORT = 8134;
export const HTTP_PORT = 80;
export const WS_PORT = 81;
export const CHUNK_SIZE = 4 * 1024; // 4KB — small enough for ESP32 WebSocket frame buffer
export const DISCOVERY_TIMEOUT_MS = 5000;
export const DISCOVERY_REGEX = /crosspoint \(on (.+?)\);(\d+)/;
export const DEFAULT_UPLOAD_PATH = '/';
export const CHUNKS_PER_WINDOW = 16; // 16 × 4KB = 64KB = one PROGRESS interval
export const PROGRESS_ACK_TIMEOUT_MS = 5000;
export const STATUS_POLL_INTERVAL_MS = 10000;
export const REQUEST_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;
export const UPLOAD_TIMEOUT_MS = 30_000;
export const HTTP_UPLOAD_TIMEOUT_MS = 300_000; // 5 min for large files over HTTP
export const BACKGROUND_UPGRADE_THRESHOLD = 0.8; // 80% — let HTTP finish if above this
