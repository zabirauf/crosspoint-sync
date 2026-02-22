import { XStack, Text } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { Pressable, useColorScheme } from 'react-native';
import { useDeviceStore } from '@/stores/device-store';

interface ConnectionPillProps {
  onPress: () => void;
}

export function ConnectionPill({ onPress }: ConnectionPillProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { connectionStatus, connectedDevice } = useDeviceStore();

  const isConnected = connectionStatus === 'connected';
  const isActive = connectionStatus === 'connecting' || connectionStatus === 'scanning';

  const dotColor = isConnected ? '#4caf50' : isActive ? '#ff9800' : '#999';
  const label = isConnected ? 'Connected' : 'Connect';

  return (
    <Pressable onPress={onPress} style={{ marginRight: 8 }} testID="Library.ConnectionPill">
      <XStack
        alignItems="center"
        gap="$1.5"
        paddingHorizontal="$2.5"
        paddingVertical="$1.5"
        borderRadius="$10"
        backgroundColor={isDark ? '$gray4' : '$gray3'}
      >
        <XStack
          width={8}
          height={8}
          borderRadius={4}
          backgroundColor={dotColor}
        />
        <Text fontSize="$2" fontWeight="500" color={isDark ? '$gray12' : '$gray11'} numberOfLines={1}>
          {label}
        </Text>
        <FontAwesome name="chevron-down" size={10} color={isDark ? '#999' : '#666'} />
      </XStack>
    </Pressable>
  );
}
