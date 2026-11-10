import { useState } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { YStack, XStack, Text, H4, Button, Separator, Input, Label } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useDeviceStore } from '@/stores/device-store';
import { useDeviceDiscovery } from '@/hooks/use-device-discovery';
import { DEFAULT_DEVICE_ADDRESS } from '@/constants/Protocol';
import { DeviceCard } from '@/components/DeviceCard';

interface ConnectionContentProps {
  onClose?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

// The sheet and Reader destination share the same connection form and actions.
export function ConnectionContent({ onClose, contentContainerStyle }: ConnectionContentProps) {
  const { connectionStatus, connectedDevice, deviceStatus, lastDeviceIp, error: deviceError } =
    useDeviceStore();
  const [manualIp, setManualIp] = useState(lastDeviceIp ?? DEFAULT_DEVICE_ADDRESS);
  const disconnect = useDeviceStore((s) => s.disconnect);

  const { error: connectError, connectManualIP } = useDeviceDiscovery();

  const isConnected = connectionStatus === 'connected';
  const error = deviceError || connectError;

  return (
    <ScrollView testID="Connection.Content" keyboardShouldPersistTaps="handled" style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }} contentContainerStyle={[{ paddingBottom: 8 }, contentContainerStyle]}>
      <YStack gap="$3">
        <XStack justifyContent="space-between" alignItems="center">
          <H4>Device</H4>
          <XStack gap="$2" alignItems="center">
            <YStack
              width={8}
              height={8}
              borderRadius={4}
              backgroundColor={
                isConnected ? '$green11' : connectionStatus === 'connecting' ? '$yellow11' : '$gray10'
              }
            />
            <Text testID="Connection.Status" color="$gray11" fontSize="$3">
              {connectionStatus === 'connected'
                ? 'Connected'
                : connectionStatus === 'connecting'
                  ? 'Connecting...'
                  : 'Not connected'}
            </Text>
            {onClose && (
              <Button
                chromeless
                circular
                size="$4"
                accessibilityLabel="Close dialog"
                onPress={onClose}
                testID="Connection.CloseButton"
              >
                <FontAwesome name="times" size={18} color="#999" />
              </Button>
            )}
          </XStack>
        </XStack>

        <Separator />

        {/* Connected state */}
        {isConnected && connectedDevice && (
          <>
            <DeviceCard
              device={connectedDevice}
              model={deviceStatus?.device}
              status="connected"
              rssi={deviceStatus?.rssi}
            />
            {deviceStatus && (
              <YStack gap="$1" paddingTop="$1">
                <Text color="$gray11" fontSize="$2">
                  Firmware: {deviceStatus.version} | Free heap: {deviceStatus.freeHeap} bytes
                </Text>
                <Text color="$gray11" fontSize="$2">
                  Uptime: {Math.round(deviceStatus.uptime / 1000)}s | RSSI: {deviceStatus.rssi} dBm
                </Text>
              </YStack>
            )}
            <Button size="$4" theme="red" color="$red12" onPress={disconnect} testID="Connection.DisconnectButton">
              Disconnect
            </Button>
          </>
        )}

        {/* Disconnected state */}
        {!isConnected && connectionStatus !== 'connecting' && (
          <>
            <YStack testID="Connection.Instructions" backgroundColor="$blue2" borderRadius="$4" padding="$3" gap="$2">
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
              <Label testID="Connection.AddressLabel" htmlFor="device-address" fontSize="$3" color="$gray11">
                Device address
              </Label>
              <XStack gap="$2">
                <Input
                  key={lastDeviceIp ?? 'default'}
                  id="device-address"
                  flex={1}
                  minWidth={0}
                  testID="Connection.AddressInput"
                  size="$4"
                  borderColor="$gray10"
                  focusStyle={{ borderColor: '$blue10' }}
                  placeholderTextColor="$gray11"
                  placeholder="crosspoint.local"
                  defaultValue={lastDeviceIp ?? DEFAULT_DEVICE_ADDRESS}
                  onChangeText={setManualIp}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  disableFullscreenUI
                />
                <Button
                  size="$4"
                  theme="blue"
                  color="$blue12"
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
            <Text color="$gray11" fontSize="$4">
              Connecting...
            </Text>
          </YStack>
        )}

        {error && (
          <Text testID="Connection.Error" color="$red11" fontSize="$3">
            {error}
          </Text>
        )}
      </YStack>
    </ScrollView>
  );
}
