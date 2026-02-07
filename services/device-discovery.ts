import dgram from 'react-native-udp';
import { DeviceInfo } from '@/types/device';
import { getDeviceStatus } from './device-api';
import { log } from './logger';
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
  if (!dgram?.createSocket) {
    onError(
      new Error(
        'UDP discovery is not available. Please use manual IP entry to connect.',
      ),
    );
    return () => {};
  }

  const seen = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const socket = dgram.createSocket({ type: 'udp4' });

  socket.on('error', (err: Error) => {
    log('discovery', `Socket error: ${err.message}`);
    cleanup();
    onError(err);
  });

  socket.on('message', (data: Uint8Array, info: { address: string }) => {
    const message = new TextDecoder().decode(data);
    log('discovery', `UDP response from ${info.address}: ${message}`);
    const match = message.match(DISCOVERY_REGEX);
    if (match && !seen.has(info.address)) {
      seen.add(info.address);
      const wsPort = parseInt(match[2], 10) || WS_PORT;
      log('discovery', `Device found: ${match[1]} at ${info.address}:${wsPort}`);
      onDeviceFound({
        ip: info.address,
        hostname: match[1],
        wsPort,
      });
    }
  });

  socket.bind(0, () => {
    try {
      socket.setBroadcast(true);
      const msg = new TextEncoder().encode('hello');
      socket.send(msg, 0, msg.length, UDP_DISCOVERY_PORT, '255.255.255.255');
      log('discovery', `Broadcasting discovery to 255.255.255.255:${UDP_DISCOVERY_PORT}`);
    } catch (err) {
      log('discovery', `Broadcast failed: ${err instanceof Error ? err.message : String(err)}`);
      cleanup();
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  timer = setTimeout(() => {
    log('discovery', `Discovery timeout after ${DISCOVERY_TIMEOUT_MS}ms, scan complete`);
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
  log('discovery', `Validating device IP: ${ip}`);
  try {
    const status = await getDeviceStatus(ip);
    log('discovery', `IP ${ip} validated`);
    return {
      ip: status.ip || ip,
      hostname: `XTEink (${ip})`,
      wsPort: WS_PORT,
    };
  } catch {
    log('discovery', `IP ${ip} validation failed`);
    return null;
  }
}
