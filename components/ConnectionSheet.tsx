import { useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Sheet, YStack, XStack, Text, H4, Button, Separator, Input, Label } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useDeviceStore } from '@/stores/device-store';
import { useDeviceDiscovery } from '@/hooks/use-device-discovery';
import { DEFAULT_DEVICE_ADDRESS } from '@/constants/Protocol';
import { DeviceCard } from '@/components/DeviceCard';

interface ConnectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionSheet({ open, onOpenChange }: ConnectionSheetProps) {
  const { connectionStatus, connectedDevice, deviceStatus, lastDeviceIp, error: deviceError } =
    useDeviceStore();
  const [manualIp, setManualIp] = useState(lastDeviceIp ?? DEFAULT_DEVICE_ADDRESS);
  const disconnect = useDeviceStore((s) => s.disconnect);

  const { error: connectError, connectManualIP } = useDeviceDiscovery();

  const isConnected = connectionStatus === 'connected';
  const error = deviceError || connectError;

  // Auto-close only on fresh connection (transition from disconnected → connected)
  const wasConnected = useRef(isConnected);

  useEffect(() => {
    if (isConnected && !wasConnected.current && open) {
      const timer = setTimeout(() => onOpenChange(false), 600);
      wasConnected.current = true;
      return () => clearTimeout(timer);
    }
    wasConnected.current = isConnected;
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
      <Sheet.Overlay animation="lazy" opacity={0.5} enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
      <Sheet.Handle />
      <Sheet.Frame padding="$4" testID="Connection.Sheet">
        <ScrollView>
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
                      : 'Not connected'}
                </Text>
                <Button
                  chromeless
                  circular
                  size="$3"
                  onPress={() => onOpenChange(false)}
                  testID="Connection.CloseButton"
                >
                  <FontAwesome name="times" size={18} color="#999" />
                </Button>
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
                <Button size="$4" theme="red" onPress={disconnect} testID="Connection.DisconnectButton">
                  Disconnect
                </Button>
              </>
            )}

            {/* Disconnected state */}
            {!isConnected && connectionStatus !== 'connecting' && (
              <>
                <YStack backgroundColor="$blue2" borderRadius="$4" padding="$3" gap="$2">
                  <Text fontWeight="600" fontSize="$4">How to connect</Text>
                  <Text color="$gray11" fontSize="$3">
                    On your device, open File Transfer and choose:
                  </Text>
                  <YStack gap="$1.5" paddingLeft="$1">
                    <YStack>
                      <Text fontSize="$3" fontWeight="600">Join a Network</Text>
                      <Text color="$gray11" fontSize="$2">
                        Connect your device to the same WiFi as your phone.
                      </Text>
                    </YStack>
                    <YStack>
                      <Text fontSize="$3" fontWeight="600">Create Hotspot</Text>
                      <Text color="$gray11" fontSize="$2">
                        Connect your phone to the device's WiFi network.
                      </Text>
                    </YStack>
                  </YStack>
                </YStack>

                <YStack gap="$2">
                  <Label htmlFor="device-address" fontSize="$3" color="$gray10">
                    Device address
                  </Label>
                  <XStack gap="$2">
                    <Input
                      key={lastDeviceIp ?? 'default'}
                      id="device-address"
                      flex={1}
                      size="$4"
                      placeholder="crosspoint.local"
                      defaultValue={lastDeviceIp ?? DEFAULT_DEVICE_ADDRESS}
                      onChangeText={setManualIp}
                      keyboardType="url"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Button
                      size="$4"
                      theme="blue"
                      disabled={!manualIp.trim()}
                      onPress={() => connectManualIP(manualIp.trim())}
                      testID="Connection.ConnectButton"
                    >
                      Connect
                    </Button>
                  </XStack>
                </YStack>
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
        </ScrollView>
      </Sheet.Frame>
    </Sheet>
  );
}
