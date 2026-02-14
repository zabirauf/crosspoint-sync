import { useState } from 'react';
import { YStack, XStack, Text, H4, Separator, Button, useTheme } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme, Alert, Platform, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useDeviceStore } from '@/stores/device-store';
import { useSettingsStore } from '@/stores/settings-store';
import { PromptDialog } from '@/components/PromptDialog';


function SettingsRow({
  icon,
  label,
  value,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string;
  onPress?: () => void;
  testID?: string;
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
      testID={testID}
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
  const { defaultUploadPath, setDefaultUploadPath, clipUploadPath, setClipUploadPath, debugLogsEnabled, setDebugLogsEnabled } = useSettingsStore();

  const lastDeviceIp = useDeviceStore((s) => s.lastDeviceIp);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();

  const isConnected = connectionStatus === 'connected';

  const [uploadPathPromptOpen, setUploadPathPromptOpen] = useState(false);
  const [clipPathPromptOpen, setClipPathPromptOpen] = useState(false);

  const handleChangeUploadPath = () => {
    setUploadPathPromptOpen(true);
  };

  const handleChangeClipPath = () => {
    setClipPathPromptOpen(true);
  };

  const handleOpenExtensionSettings = () => {
    Linking.openURL('App-Prefs:SAFARI&path=WEB_EXTENSIONS').catch(() => {
      Linking.openSettings();
    });
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background.val }} contentContainerStyle={{ padding: 16, gap: 24 }} testID="Settings.Screen">
      <YStack gap="$2" paddingHorizontal="$2">
        <H4>Sync Settings</H4>
        <Separator marginVertical="$1" />
        <SettingsRow icon="upload" label="Upload path" value={defaultUploadPath} onPress={handleChangeUploadPath} testID="Settings.UploadPath" />
      </YStack>

      <Separator />

      <YStack gap="$2" paddingHorizontal="$2">
        <H4>{Platform.OS === 'ios' ? 'Web Clipper' : 'Article Clipper'}</H4>
        <Separator marginVertical="$1" />
        <SettingsRow icon="folder-o" label="Clip upload path" value={clipUploadPath} onPress={handleChangeClipPath} testID="Settings.ClipPath" />
        {Platform.OS === 'ios' && (
          <>
            <Separator />
            <SettingsRow icon="safari" label="Enable in Safari" value="Safari → Extensions" onPress={handleOpenExtensionSettings} />
          </>
        )}
      </YStack>

      <Separator />

      <YStack gap="$2" paddingHorizontal="$2">
        <H4>Device</H4>
        <Separator marginVertical="$1" />
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
            <Button size="$3" theme="red" marginTop="$2" onPress={handleForgetDevice} testID="Settings.ForgetDevice">
              Forget Device
            </Button>
          </>
        )}
      </YStack>

      <Separator />

      <YStack gap="$2" paddingHorizontal="$2">
        <H4>Debug</H4>
        <Separator marginVertical="$1" />
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingVertical="$2"
          onPress={() => setDebugLogsEnabled(!debugLogsEnabled)}
          pressStyle={{ opacity: 0.7 }}
        >
          <XStack gap="$3" alignItems="center">
            <FontAwesome
              name={debugLogsEnabled ? 'toggle-on' : 'toggle-off'}
              size={22}
              color={debugLogsEnabled ? '#22C55E' : (isDark ? '#555' : '#ccc')}
            />
            <Text fontSize="$4">Debug Logging</Text>
          </XStack>
        </XStack>
        <Separator />
        <SettingsRow
          icon="file-text-o"
          label="View Logs"
          value=""
          onPress={() => router.push('/debug-logs')}
          testID="Settings.ViewLogs"
        />
      </YStack>

      {/* Prompt dialogs (cross-platform replacement for Alert.prompt) */}
      <PromptDialog
        open={uploadPathPromptOpen}
        onOpenChange={setUploadPathPromptOpen}
        title="Upload Path"
        message="Enter the destination folder on the device (e.g. / or /Books)"
        defaultValue={defaultUploadPath}
        onSubmit={(value) => {
          const path = value.trim() || '/';
          setDefaultUploadPath(path.startsWith('/') ? path : `/${path}`);
        }}
      />
      <PromptDialog
        open={clipPathPromptOpen}
        onOpenChange={setClipPathPromptOpen}
        title="Clip Upload Path"
        message="Enter the destination folder for clipped articles (e.g. /Articles)"
        defaultValue={clipUploadPath}
        onSubmit={(value) => {
          const path = value.trim() || '/Articles';
          setClipUploadPath(path.startsWith('/') ? path : `/${path}`);
        }}
      />
    </ScrollView>
  );
}
