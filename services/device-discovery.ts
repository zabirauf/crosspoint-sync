import { Platform } from 'react-native';
import { DeviceInfo, DeviceStatus } from '@/types/device';
import { getDeviceStatus } from './device-api';
import { log } from './logger';
import { HTTP_PORT, WS_PORT } from '@/constants/Protocol';

const VALIDATION_RETRIES = Platform.OS === 'android' ? 2 : 0;
const VALIDATION_RETRY_DELAY_MS = 1500;

/** Parse "host:port" into { host, httpPort }. Bare host defaults to port 80. */
export function parseAddress(address: string): { host: string; httpPort: number } {
  const trimmed = address.trim();
  const match = trimmed.match(/^(.+):(\d+)$/);
  if (match) {
    return { host: match[1], httpPort: parseInt(match[2], 10) };
  }
  return { host: trimmed, httpPort: HTTP_PORT };
}

export async function validateDeviceIP(
  address: string,
): Promise<{ device: DeviceInfo; status: DeviceStatus } | null> {
  const { host, httpPort } = parseAddress(address);
  log('discovery', `Validating device: ${host}:${httpPort}`);

  for (let attempt = 0; attempt <= VALIDATION_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        log('discovery', `Retry ${attempt}/${VALIDATION_RETRIES} for ${host}:${httpPort}`);
        await new Promise((r) => setTimeout(r, VALIDATION_RETRY_DELAY_MS));
      }
      const status = await getDeviceStatus(host, { httpPort });
      const wsPort = httpPort === HTTP_PORT ? WS_PORT : httpPort + 1;
      log('discovery', `Device ${host}:${httpPort} validated`);
      return {
        device: {
          ip: host,
          hostname: `XTEink (${host})`,
          httpPort,
          wsPort,
        },
        status,
      };
    } catch {
      log('discovery', `Device ${host}:${httpPort} validation failed (attempt ${attempt + 1}/${VALIDATION_RETRIES + 1})`);
    }
  }

  return null;
}
