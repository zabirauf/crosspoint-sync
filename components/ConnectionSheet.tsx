import { useEffect, useState } from 'react';
import { Sheet, YStack, XStack, Text, H4, Button, Separator, Input } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useDeviceStore } from '@/stores/device-store';
import { useDeviceDiscovery } from '@/hooks/use-device-discovery';
import { DeviceCard } from '@/components/DeviceCard';
import { ScanningIndicator } from '@/components/ScanningIndicator';

interface ConnectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionSheet({ open, onOpenChange }: ConnectionSheetProps) {
  const { connectionStatus, connectedDevice, deviceStatus, lastDeviceIp, error: deviceError } =
    useDeviceStore();
  const [manualIp, setManualIp] = useState(lastDeviceIp ?? '');
  const disconnect = useDeviceStore((s) => s.disconnect);

  const {
    devices,
    isScanning,
    error: scanError,
    startScan,
    stopScan,
    connectToDevice,
    connectManualIP,
  } = useDeviceDiscovery();

  // Prefill manual IP when store hydrates
  useEffect(() => {
    if (lastDeviceIp && !manualIp) {
      setManualIp(lastDeviceIp);
    }
  }, [lastDeviceIp]); // eslint-disable-line react-hooks/exhaustive-deps

  const isConnected = connectionStatus === 'connected';
  const error = deviceError || scanError;

  // Auto-close after successful connection
  useEffect(() => {
    if (isConnected && open) {
      const timer = setTimeout(() => onOpenChange(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isConnected, open, onOpenChange]);

  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[85, 50]}
      dismissOnSnapToBottom
      zIndex={100_000}
      animation="medium"
    >
      <Sheet.Overlay animation="lazy" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
      <Sheet.Handle />
      <Sheet.Frame padding="$4">
        <Sheet.ScrollView>
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
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  );
}
