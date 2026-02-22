import { useEffect } from 'react';
import { YStack, Text } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export function ScanningIndicator() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <YStack alignItems="center" gap="$2" paddingVertical="$4" testID="Connection.ScanningIndicator">
      <Animated.View style={animatedStyle}>
        <FontAwesome name="wifi" size={32} color={isDark ? '#81d4fa' : '#1a73e8'} />
      </Animated.View>
      <Text color="$gray10" fontSize="$3">
        Scanning for devices...
      </Text>
    </YStack>
  );
}
