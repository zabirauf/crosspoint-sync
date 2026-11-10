import { XStack, YStack, Text, Card, useTheme } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { getReaderName } from '@/constants/ReaderProfiles';
import { DeviceInfo, ConnectionStatus } from '@/types/device';

interface DeviceCardProps {
  device: DeviceInfo;
  model?: string;
  status?: ConnectionStatus;
  rssi?: number;
  onPress?: () => void;
}

export function DeviceCard({ device, model, status, rssi, onPress }: DeviceCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();
  const signalColor = rssi === undefined ? theme.gray11.val
    : rssi > -50 ? theme.green11.val : rssi > -70 ? theme.orange11.val : theme.red11.val;
  const statusColor = status === 'connected' ? theme.green11.val
    : status === 'connecting' ? theme.orange11.val : status === 'error' ? theme.red11.val : theme.gray11.val;

  return (
    <Card
      bordered
      padded
      elevate
      size="$4"
      animation="bouncy"
      pressStyle={onPress ? { scale: 0.97, opacity: 0.9 } : undefined}
      onPress={onPress}
      testID="Connection.DeviceCard"
    >
      <XStack gap="$3" alignItems="center">
        <YStack
          width={48}
          height={48}
          backgroundColor={isDark ? '$gray5' : '$gray3'}
          borderRadius="$3"
          alignItems="center"
          justifyContent="center"
        >
          <FontAwesome name="tablet" size={24} color={isDark ? '#ccc' : '#555'} />
        </YStack>
        <YStack flex={1} gap="$1">
          <Text testID="Connection.DeviceModel" fontWeight="600" fontSize="$5">
            {getReaderName(model, device.hostname)}
          </Text>
          <Text color="$gray11" fontSize="$3">
            {device.ip}
          </Text>
        </YStack>
        <YStack alignItems="center" gap="$1">
          {rssi !== undefined && (
            <FontAwesome name="wifi" size={14} color={signalColor} />
          )}
          <YStack
            width={8}
            height={8}
            borderRadius={4}
            backgroundColor={statusColor}
          />
        </YStack>
      </XStack>
    </Card>
  );
}
