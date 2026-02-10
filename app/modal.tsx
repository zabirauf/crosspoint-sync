import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { YStack, Text, H4, Separator } from 'tamagui';

export default function ModalScreen() {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
      <H4>About CrossPoint Sync</H4>
      <Separator marginVertical="$4" width="80%" />
      <Text color="$gray10" textAlign="center" fontSize="$4">
        Sync your books to e-ink devices.
      </Text>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </YStack>
  );
}
