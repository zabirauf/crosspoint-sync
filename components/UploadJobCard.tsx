import { XStack, YStack, Text, Card, Progress, Button } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { UploadJob } from '@/types/upload';

interface UploadJobCardProps {
  job: UploadJob;
  onCancel?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  onOverwrite?: () => void;
}

function statusLabel(status: UploadJob['status']): string {
  switch (status) {
    case 'pending':
      return 'Waiting';
    case 'uploading':
      return 'Uploading';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'conflict':
      return 'File Exists';
  }
}

function statusColor(status: UploadJob['status']): string {
  switch (status) {
    case 'pending':
      return '$gray10';
    case 'uploading':
      return '$blue10';
    case 'completed':
      return '$green10';
    case 'failed':
      return '$red10';
    case 'cancelled':
      return '$gray10';
    case 'conflict':
      return '$yellow10';
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadJobCard({ job, onCancel, onRetry, onRemove, onOverwrite }: UploadJobCardProps) {
  return (
    <Card bordered padded size="$3">
      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$4" fontWeight="500" flex={1} numberOfLines={1}>
            {job.fileName}
          </Text>
          <Text color={statusColor(job.status)} fontSize="$2" fontWeight="600">
            {statusLabel(job.status)}
          </Text>
        </XStack>

        {job.status === 'uploading' && (
          <YStack gap="$1">
            <Progress value={Math.round(job.progress * 100)} size="$2">
              <Progress.Indicator animation="bouncy" />
            </Progress>
            <XStack justifyContent="space-between">
              <Text color="$gray10" fontSize="$1">
                {formatSize(job.bytesTransferred)} / {formatSize(job.fileSize)}
              </Text>
              <Text color="$gray10" fontSize="$1">
                {Math.round(job.progress * 100)}%
              </Text>
            </XStack>
          </YStack>
        )}

        {job.error && (
          <Text color="$red10" fontSize="$2">
            {job.error}
          </Text>
        )}

        {job.status === 'conflict' && (
          <Text color="$gray10" fontSize="$2">
            A file with this name already exists on the device
          </Text>
        )}

        <XStack gap="$2" justifyContent="flex-end">
          {job.status === 'uploading' && onCancel && (
            <Button size="$2" theme="red" onPress={onCancel}>
              Cancel
            </Button>
          )}
          {job.status === 'conflict' && onOverwrite && (
            <Button size="$2" theme="orange" onPress={onOverwrite}>
              Overwrite
            </Button>
          )}
          {job.status === 'conflict' && onRemove && (
            <Button size="$2" chromeless onPress={onRemove}>
              Remove
            </Button>
          )}
          {(job.status === 'failed' || job.status === 'cancelled') && onRetry && (
            <Button size="$2" theme="blue" onPress={onRetry}>
              Retry
            </Button>
          )}
          {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
            onRemove && (
              <Button size="$2" chromeless onPress={onRemove}>
                <FontAwesome name="times" size={14} />
              </Button>
            )}
        </XStack>
      </YStack>
    </Card>
  );
}
