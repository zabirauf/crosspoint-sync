import { XStack, YStack, Text, Card } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { DeviceInfo, ConnectionStatus } from '@/types/device';

interface DeviceCardProps {
  device: DeviceInfo;
  status?: ConnectionStatus;
  rssi?: number;
  onPress?: () => void;
}

function signalColor(rssi?: number): string {
  if (rssi === undefined) return '#999';
  if (rssi > -50) return '#4caf50';
  if (rssi > -70) return '#ff9800';
  return '#f44336';
}

function statusColor(status?: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '#4caf50';
    case 'connecting':
      return '#ff9800';
    case 'error':
      return '#f44336';
    default:
      return '#999';
  }
}

export function DeviceCard({ device, status, rssi, onPress }: DeviceCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
          <Text fontWeight="600" fontSize="$5">
            {device.hostname}
          </Text>
          <Text color="$gray10" fontSize="$3">
            {device.ip}
          </Text>
        </YStack>
        <YStack alignItems="center" gap="$1">
          {rssi !== undefined && (
            <FontAwesome name="wifi" size={14} color={signalColor(rssi)} />
          )}
          <YStack
            width={8}
            height={8}
            borderRadius={4}
            backgroundColor={statusColor(status)}
          />
        </YStack>
      </XStack>
    </Card>
  );
}
