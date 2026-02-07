import dgram from 'react-native-udp';
import { DeviceInfo } from '@/types/device';
import { getDeviceStatus } from './device-api';
import {
  UDP_DISCOVERY_PORT,
  WS_PORT,
  DISCOVERY_TIMEOUT_MS,
  DISCOVERY_REGEX,
} from '@/constants/Protocol';

export function discoverDevices(
  onDeviceFound: (device: DeviceInfo) => void,
  onComplete: () => void,
  onError: (error: Error) => void,
): () => void {
  const seen = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const socket = dgram.createSocket({ type: 'udp4' });

  socket.on('error', (err: Error) => {
    cleanup();
    onError(err);
  });

  socket.on('message', (data: Buffer, info: { address: string }) => {
    const message = data.toString('utf-8');
    const match = message.match(DISCOVERY_REGEX);
    if (match && !seen.has(info.address)) {
      seen.add(info.address);
      onDeviceFound({
        ip: info.address,
        hostname: match[1],
        wsPort: parseInt(match[2], 10) || WS_PORT,
      });
    }
  });

  socket.bind(0, () => {
    try {
      socket.setBroadcast(true);
      const msg = Buffer.from('hello');
      socket.send(msg, 0, msg.length, UDP_DISCOVERY_PORT, '255.255.255.255');
    } catch (err) {
      cleanup();
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  timer = setTimeout(() => {
    cleanup();
    onComplete();
  }, DISCOVERY_TIMEOUT_MS);

  function cleanup() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      socket.close();
    } catch {
      // socket may already be closed
    }
  }

  return cleanup;
}

export async function validateDeviceIP(
  ip: string,
): Promise<DeviceInfo | null> {
  try {
    const status = await getDeviceStatus(ip);
    return {
      ip: status.ip || ip,
      hostname: `XTEink (${ip})`,
      wsPort: WS_PORT,
    };
  } catch {
    return null;
  }
}
