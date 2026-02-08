import { useEffect, useRef } from 'react';
import { getDeviceStatus } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';
import { STATUS_POLL_INTERVAL_MS, MAX_CONSECUTIVE_FAILURES } from '@/constants/Protocol';
import { log } from '@/services/logger';
import { DeviceSchedulerDroppedError } from '@/services/device-request-scheduler';

export function useDeviceStatusPolling() {
  const {
    connectionStatus,
    connectedDevice,
    updateDeviceStatus,
    disconnect,
  } = useDeviceStore();
  const failureCount = useRef(0);

  useEffect(() => {
    if (connectionStatus !== 'connected' || !connectedDevice) {
      failureCount.current = 0;
      return;
    }

    let active = true;

    async function poll() {
      if (!active || !connectedDevice) return;
      try {
        const status = await getDeviceStatus(connectedDevice.ip, {
          priority: 'low',
          droppable: true,
        });
        if (active) {
          log('connection', `Status poll OK: RSSI ${status.rssi ?? 'N/A'}, heap ${status.freeHeap ?? 'N/A'}, uptime ${status.uptime ?? 'N/A'}s`);
          updateDeviceStatus(status);
          failureCount.current = 0;
        }
      } catch (err) {
        if (err instanceof DeviceSchedulerDroppedError) {
          log('connection', 'Poll skipped (device busy)');
          return;
        }
        failureCount.current++;
        log('connection', `Status poll failed (${failureCount.current}/${MAX_CONSECUTIVE_FAILURES})`);
        if (failureCount.current >= MAX_CONSECUTIVE_FAILURES && active) {
          log('connection', `Auto-disconnect: ${MAX_CONSECUTIVE_FAILURES} consecutive poll failures`);
          disconnect();
        }
      }
    }

    // Poll immediately, then on interval
    poll();
    const interval = setInterval(poll, STATUS_POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [connectionStatus, connectedDevice, updateDeviceStatus, disconnect]);
}
