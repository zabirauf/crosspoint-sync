import { YStack, XStack, Text, H4, Card, Separator, Button } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme, Alert } from 'react-native';
import Constants from 'expo-constants';
import { useDeviceStore } from '@/stores/device-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUploadStore } from '@/stores/upload-store';

function SettingsRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      paddingVertical="$2"
      onPress={onPress}
      pressStyle={onPress ? { opacity: 0.7 } : undefined}
    >
      <XStack gap="$3" alignItems="center">
        <FontAwesome name={icon} size={16} color={isDark ? '#aaa' : '#666'} />
        <Text fontSize="$4">{label}</Text>
      </XStack>
      <XStack gap="$2" alignItems="center">
        <Text color="$gray10" fontSize="$3">
          {value}
        </Text>
        {onPress && <FontAwesome name="chevron-right" size={12} color={isDark ? '#555' : '#ccc'} />}
      </XStack>
    </XStack>
  );
}

export default function SettingsScreen() {
  const { connectedDevice, deviceStatus, connectionStatus } = useDeviceStore();
  const disconnect = useDeviceStore((s) => s.disconnect);
  const { preferredFormat, setPreferredFormat, defaultUploadPath } = useSettingsStore();
  const clearCompleted = useUploadStore((s) => s.clearCompleted);
  const lastDeviceIp = useDeviceStore((s) => s.lastDeviceIp);

  const isConnected = connectionStatus === 'connected';

  const handleToggleFormat = () => {
    setPreferredFormat(preferredFormat === 'EPUB' ? 'PDF' : 'EPUB');
  };

  const handleForgetDevice = () => {
    Alert.alert(
      'Forget Device',
      'This will disconnect and clear the saved device IP. You will need to scan or enter the IP again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            disconnect();
            // Clear lastDeviceIp by setting to null via store
            useDeviceStore.setState({ lastDeviceIp: null });
          },
        },
      ],
    );
  };

  const handleClearHistory = () => {
    clearCompleted();
    Alert.alert('Cleared', 'Upload history has been cleared.');
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <YStack flex={1} padding="$4" gap="$4" backgroundColor="$background">
      <Card bordered padded elevate size="$4">
        <YStack gap="$2">
          <H4>Sync Settings</H4>
          <Separator marginVertical="$2" />
          <SettingsRow
            icon="folder"
            label="Default format"
            value={preferredFormat}
            onPress={handleToggleFormat}
          />
          <Separator />
          <SettingsRow icon="upload" label="Upload path" value={defaultUploadPath} />
        </YStack>
      </Card>

      <Card bordered padded elevate size="$4">
        <YStack gap="$2">
          <H4>Device</H4>
          <Separator marginVertical="$2" />
          <SettingsRow
            icon="tablet"
            label="Device"
            value={
              isConnected && connectedDevice
                ? connectedDevice.hostname
                : 'Not connected'
            }
          />
          <Separator />
          <SettingsRow
            icon="wifi"
            label="IP Address"
            value={
              isConnected && connectedDevice
                ? connectedDevice.ip
                : lastDeviceIp ?? 'None'
            }
          />
          <Separator />
          <SettingsRow
            icon="code"
            label="Firmware"
            value={deviceStatus?.version ?? 'N/A'}
          />
          {(isConnected || lastDeviceIp) && (
            <>
              <Separator />
              <Button size="$3" theme="red" marginTop="$2" onPress={handleForgetDevice}>
                Forget Device
              </Button>
            </>
          )}
        </YStack>
      </Card>

      <Card bordered padded elevate size="$4">
        <YStack gap="$2">
          <H4>Data</H4>
          <Separator marginVertical="$2" />
          <Button size="$3" onPress={handleClearHistory}>
            Clear Upload History
          </Button>
        </YStack>
      </Card>

      <Card bordered padded elevate size="$4">
        <YStack gap="$2">
          <H4>About</H4>
          <Separator marginVertical="$2" />
          <SettingsRow icon="info-circle" label="Version" value={appVersion} />
          <Separator />
          <SettingsRow icon="code" label="Build" value="Expo SDK 54" />
        </YStack>
      </Card>
    </YStack>
  );
}
