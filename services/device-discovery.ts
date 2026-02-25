import { DeviceInfo, DeviceStatus } from '@/types/device';
import { getDeviceStatus } from './device-api';
import { log } from './logger';
import { WS_PORT } from '@/constants/Protocol';

export async function validateDeviceIP(
  ip: string,
): Promise<{ device: DeviceInfo; status: DeviceStatus } | null> {
  log('discovery', `Validating device IP: ${ip}`);
  try {
    const status = await getDeviceStatus(ip);
    log('discovery', `IP ${ip} validated`);
    return {
      device: {
        ip: status.ip || ip,
        hostname: `XTEink (${ip})`,
        wsPort: WS_PORT,
      },
      status,
    };
  } catch {
    log('discovery', `IP ${ip} validation failed`);
    return null;
  }
}
