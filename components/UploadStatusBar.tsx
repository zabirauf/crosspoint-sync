import { XStack, YStack, Text, Progress } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { Pressable, useColorScheme } from 'react-native';
import { useUploadStore } from '@/stores/upload-store';

interface UploadStatusBarProps {
  onPress: () => void;
}

export function UploadStatusBar({ onPress }: UploadStatusBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { jobs } = useUploadStore();

  const activeJob = jobs.find((j) => j.status === 'uploading');
  const processingCount = jobs.filter((j) => j.status === 'processing').length;
  const pendingCount = jobs.filter((j) => j.status === 'pending').length;
  const conflictCount = jobs.filter((j) => j.status === 'conflict').length;
  const failedCount = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled').length;

  const hasActionable = activeJob || processingCount > 0 || pendingCount > 0 || conflictCount > 0 || failedCount > 0;
  if (!hasActionable) return null;

  let label: string;
  let iconName: React.ComponentProps<typeof FontAwesome>['name'] = 'cloud-upload';
  let iconColor = isDark ? '#81d4fa' : '#1a73e8';

  if (activeJob) {
    label = activeJob.fileName;
  } else if (conflictCount > 0) {
    label = `${conflictCount} conflict${conflictCount > 1 ? 's' : ''} to resolve`;
    iconName = 'warning';
    iconColor = '#f5a623';
  } else if (failedCount > 0) {
    label = `${failedCount} upload${failedCount > 1 ? 's' : ''} failed`;
    iconName = 'exclamation-circle';
    iconColor = '#f44336';
  } else if (processingCount > 0) {
    label = processingCount === 1 ? 'Clipping article...' : `Clipping ${processingCount} articles...`;
    iconName = 'link';
    iconColor = isDark ? '#ce93d8' : '#9c27b0';
  } else {
    label = `${pendingCount} upload${pendingCount > 1 ? 's' : ''} waiting`;
  }

  return (
    <Pressable onPress={onPress}>
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2.5"
        marginHorizontal="$3"
        marginBottom="$2"
        borderRadius="$4"
        backgroundColor={isDark ? '$gray3' : '$gray2'}
        alignItems="center"
        gap="$2.5"
        borderWidth={0.5}
        borderColor={isDark ? '$gray5' : '$gray4'}
      >
        <FontAwesome name={iconName} size={16} color={iconColor} />
        <YStack flex={1} gap="$1">
          <Text fontSize="$2" fontWeight="500" numberOfLines={1}>
            {label}
          </Text>
          {activeJob && (
            <Progress value={Math.round(activeJob.progress * 100)} size="$1">
              <Progress.Indicator animation="bouncy" />
            </Progress>
          )}
        </YStack>
        <FontAwesome name="chevron-up" size={12} color={isDark ? '#999' : '#666'} />
      </XStack>
    </Pressable>
  );
}
