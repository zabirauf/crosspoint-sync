import { YStack, Text } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

interface EmptyStateProps {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
      <FontAwesome name={icon} size={48} color={isDark ? '#555' : '#ccc'} />
      <Text fontSize="$5" fontWeight="600" textAlign="center">
        {title}
      </Text>
      {subtitle && (
        <Text color="$gray10" fontSize="$3" textAlign="center">
          {subtitle}
        </Text>
      )}
    </YStack>
  );
}
