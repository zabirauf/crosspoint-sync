export interface DeviceInfo {
  ip: string;
  hostname: string;
  wsPort: number;
}

export interface DeviceStatus {
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
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';
