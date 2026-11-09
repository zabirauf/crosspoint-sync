export interface DeviceInfo {
  ip: string;
  hostname: string;
  httpPort: number;
  wsPort: number;
}

export interface DeviceStatus {
  /** Reported by CrossPoint 1.3+; older firmware omits these fields. */
  device?: string;
  firmwareFamily?: string;
  version: string;
  ip: string;
  mode: string;
  rssi: number;
  freeHeap: number;
  uptime: number;
}

export interface DeviceFile {
  name: string;
  size: number;
  isDirectory: boolean;
  isEpub: boolean;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';
