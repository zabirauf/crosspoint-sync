import { YStack, Text, Button } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

interface EmptyStateProps {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3" testID="EmptyState">
      <FontAwesome name={icon} size={48} color={isDark ? '#555' : '#ccc'} />
      <Text fontSize="$5" fontWeight="600" textAlign="center">
        {title}
      </Text>
      {subtitle && (
        <Text color="$gray10" fontSize="$3" textAlign="center">
          {subtitle}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button size="$4" theme="blue" onPress={onAction} marginTop="$2">
          {actionLabel}
        </Button>
      )}
    </YStack>
  );
}
