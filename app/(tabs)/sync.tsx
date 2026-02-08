import { useEffect, useState } from 'react';
import { YStack, XStack, Text, H4, Button, Card, Separator, ScrollView, Input } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useDeviceDiscovery } from '@/hooks/use-device-discovery';
import { useDocumentPicker } from '@/hooks/use-document-picker';
import { cancelCurrentUploadJob } from '@/services/upload-queue';
import { DeviceCard } from '@/components/DeviceCard';
import { UploadJobCard } from '@/components/UploadJobCard';
import { ScanningIndicator } from '@/components/ScanningIndicator';

export default function SyncScreen() {
  const { connectionStatus, connectedDevice, deviceStatus, lastDeviceIp, error: deviceError } =
    useDeviceStore();
  const [manualIp, setManualIp] = useState(lastDeviceIp ?? '');
  const disconnect = useDeviceStore((s) => s.disconnect);
  const { jobs } = useUploadStore();
  const { removeJob, retryJob, clearCompleted, resolveConflict } = useUploadStore();
  const { defaultUploadPath } = useSettingsStore();

  const {
    devices,
    isScanning,
    error: scanError,
    startScan,
    stopScan,
    connectToDevice,
    connectManualIP,
  } = useDeviceDiscovery();

  const { pickAndQueueFiles } = useDocumentPicker();

  // Prefill manual IP when store hydrates with a saved value
  useEffect(() => {
    if (lastDeviceIp && !manualIp) {
      setManualIp(lastDeviceIp);
    }
  }, [lastDeviceIp]); // eslint-disable-line react-hooks/exhaustive-deps

  const isConnected = connectionStatus === 'connected';
  const activeJob = jobs.find((j) => j.status === 'uploading');
  const pendingJobs = jobs.filter((j) => j.status === 'pending');
  const conflictJobs = jobs.filter((j) => j.status === 'conflict');
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedJobs = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');

  const error = deviceError || scanError;

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack padding="$4" gap="$4">
        {/* Device Connection Card */}
        <Card bordered padded elevate size="$4">
          <YStack gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <H4>Device</H4>
              <XStack gap="$2" alignItems="center">
                <YStack
                  width={8}
                  height={8}
                  borderRadius={4}
                  backgroundColor={
                    isConnected ? '$green9' : connectionStatus === 'connecting' ? '$yellow9' : '$gray8'
                  }
                />
                <Text color="$gray10" fontSize="$3">
                  {connectionStatus === 'connected'
                    ? 'Connected'
                    : connectionStatus === 'connecting'
                      ? 'Connecting...'
                      : connectionStatus === 'scanning'
                        ? 'Scanning...'
                        : 'Not connected'}
                </Text>
              </XStack>
            </XStack>

            <Separator />

            {/* Connected state */}
            {isConnected && connectedDevice && (
              <>
                <DeviceCard
                  device={connectedDevice}
                  status="connected"
                  rssi={deviceStatus?.rssi}
                />
                {deviceStatus && (
                  <YStack gap="$1" paddingTop="$1">
                    <Text color="$gray10" fontSize="$2">
                      Firmware: {deviceStatus.version} | Free heap: {deviceStatus.freeHeap} bytes
                    </Text>
                    <Text color="$gray10" fontSize="$2">
                      Uptime: {Math.round(deviceStatus.uptime / 1000)}s | RSSI: {deviceStatus.rssi} dBm
                    </Text>
                  </YStack>
                )}
                <Button size="$4" theme="red" onPress={disconnect}>
                  Disconnect
                </Button>
              </>
            )}

            {/* Scanning state */}
            {isScanning && (
              <>
                <ScanningIndicator />
                {devices.map((device) => (
                  <DeviceCard
                    key={device.ip}
                    device={device}
                    onPress={() => {
                      stopScan();
                      connectToDevice(device);
                    }}
                  />
                ))}
                <Button size="$3" chromeless onPress={stopScan}>
                  Stop Scanning
                </Button>
              </>
            )}

            {/* Disconnected state */}
            {!isConnected && !isScanning && connectionStatus !== 'connecting' && (
              <>
                <Button size="$4" theme="blue" onPress={startScan}>
                  Scan for Devices
                </Button>

                <Separator />

                <Text color="$gray10" fontSize="$3">
                  Or enter device IP manually:
                </Text>
                <XStack gap="$2">
                  <Input
                    flex={1}
                    size="$4"
                    placeholder="192.168.1.x"
                    value={manualIp}
                    onChangeText={setManualIp}
                    keyboardType="numeric"
                  />
                  <Button
                    size="$4"
                    theme="blue"
                    disabled={!manualIp.trim()}
                    onPress={() => connectManualIP(manualIp.trim())}
                  >
                    Connect
                  </Button>
                </XStack>
              </>
            )}

            {/* Connecting state */}
            {connectionStatus === 'connecting' && (
              <YStack alignItems="center" paddingVertical="$3">
                <Text color="$gray10" fontSize="$4">
                  Connecting...
                </Text>
              </YStack>
            )}

            {error && (
              <Text color="$red10" fontSize="$3">
                {error}
              </Text>
            )}
          </YStack>
        </Card>

        {/* Upload Queue Card */}
        <Card bordered padded elevate size="$4">
          <YStack gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <H4>Upload Queue</H4>
              {completedCount > 0 && (
                <Text color="$gray10" fontSize="$2">
                  {completedCount} completed
                </Text>
              )}
            </XStack>

            <Separator />

            {/* Active upload */}
            {activeJob && (
              <UploadJobCard
                job={activeJob}
                onCancel={() => cancelCurrentUploadJob()}
              />
            )}

            {(activeJob || pendingJobs.length > 0) && (
              <XStack gap="$2" alignItems="center" paddingVertical="$1">
                <FontAwesome name="info-circle" size={14} color="#f5a623" />
                <Text color="$gray10" fontSize="$2">
                  Keep the app open while uploading. Backgrounding will pause and restart transfers.
                </Text>
              </XStack>
            )}

            {/* Pending jobs */}
            {pendingJobs.map((job) => (
              <UploadJobCard
                key={job.id}
                job={job}
                onRemove={() => removeJob(job.id)}
              />
            ))}

            {/* Conflict jobs */}
            {conflictJobs.length > 0 && (
              <XStack gap="$2" alignItems="center" paddingTop="$2">
                <FontAwesome name="warning" size={14} color="#f5a623" />
                <Text color="$yellow10" fontSize="$3" fontWeight="600">
                  Conflicts
                </Text>
              </XStack>
            )}
            {conflictJobs.map((job) => (
              <UploadJobCard
                key={job.id}
                job={job}
                onOverwrite={() => resolveConflict(job.id, 'overwrite')}
                onRemove={() => resolveConflict(job.id, 'remove')}
              />
            ))}

            {/* Failed/cancelled jobs */}
            {failedJobs.map((job) => (
              <UploadJobCard
                key={job.id}
                job={job}
                onRetry={() => retryJob(job.id)}
                onRemove={() => removeJob(job.id)}
              />
            ))}

            {!activeJob && pendingJobs.length === 0 && conflictJobs.length === 0 && failedJobs.length === 0 && (
              <Text color="$gray10" fontSize="$3" textAlign="center" paddingVertical="$2">
                No uploads in queue
              </Text>
            )}

            <Button
              size="$4"
              theme="blue"
              icon={<FontAwesome name="plus" size={16} color="#fff" />}
              onPress={() => pickAndQueueFiles(defaultUploadPath)}
            >
              Add Books
            </Button>

            {!isConnected && pendingJobs.length > 0 && (
              <Text color="$gray10" fontSize="$2" textAlign="center">
                Books will upload when a device connects
              </Text>
            )}

            {completedCount > 0 && (
              <Button size="$3" chromeless onPress={clearCompleted}>
                Clear Completed
              </Button>
            )}
          </YStack>
        </Card>
      </YStack>
    </ScrollView>
  );
}
