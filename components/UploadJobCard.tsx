import { useEffect, useState } from 'react';
import { XStack, YStack, Text, Card, Progress, Button } from 'tamagui';
import { UploadJob } from '@/types/upload';
import { formatSize } from '@/utils/format';
import { acsmJobProgress, formatElapsed } from '@/utils/fulfillment-progress';

interface UploadJobCardProps {
  job: UploadJob;
  onCancel?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  onOverwrite?: () => void;
}

function statusLabel(status: UploadJob['status']): string {
  switch (status) {
    case 'processing':
      return 'Clipping';
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
    case 'processing':
      return '$purple10';
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

/** Re-renders once a second while `active`, for elapsed-time displays. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function UploadJobCard({ job, onCancel, onRetry, onRemove, onOverwrite }: UploadJobCardProps) {
  // After an .acsm upload, the reader's Protected Content plugin fetches the book.
  const fetching = job.status === 'uploading' && job.fulfillment?.state === 'running';
  const now = useNow(fetching);
  const acsm = acsmJobProgress(job, now);
  const fulfillmentNote = job.status === 'completed' ? job.fulfillment?.message : undefined;
  return (
    <Card bordered padded size="$3" testID={`UploadQueue.Job.${job.id}`}>
      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$4" fontWeight="500" flex={1} numberOfLines={1}>
            {job.fileName}
          </Text>
          <Text color={statusColor(job.status)} fontSize="$2" fontWeight="600" testID={`UploadQueue.Job.${job.id}.Status`}>
            {acsm?.label ?? statusLabel(job.status)}
          </Text>
        </XStack>
        <Text color="$gray10" fontSize="$2" numberOfLines={1}>
          {job.destinationPath}
        </Text>

        {job.status === 'processing' && (
          <Progress size="$2">
            <Progress.Indicator animation="bouncy" width="30%" />
          </Progress>
        )}

        {acsm && (
          <YStack gap="$1" testID={`UploadQueue.Job.${job.id}.Fulfillment`}>
            <Progress value={Math.round(acsm.value * 100)} size="$2">
              <Progress.Indicator animation="lazy" />
            </Progress>
            <XStack justifyContent="space-between" gap="$2">
              <Text color="$gray11" fontSize="$2" flex={1}>
                {acsm.detail}
              </Text>
              {acsm.elapsedSeconds !== undefined && (
                <Text color="$gray10" fontSize="$2" fontVariant={['tabular-nums']}>
                  {formatElapsed(acsm.elapsedSeconds)}
                </Text>
              )}
            </XStack>
            {fetching && (
              <Text color="$gray10" fontSize="$1">
                Large books can take a few minutes. Keep CrossPoint Sync open until the book arrives.
              </Text>
            )}
          </YStack>
        )}

        {job.status === 'uploading' && !acsm && (
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

        {fulfillmentNote && (
          <Text
            color={job.fulfillment?.state === 'skipped' ? '$yellow11' : '$gray11'}
            fontSize="$2"
            testID={`UploadQueue.Job.${job.id}.Fulfillment`}
          >
            {fulfillmentNote}
          </Text>
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
              {fetching ? 'Stop Waiting' : 'Cancel'}
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
          {(job.status === 'processing' || job.status === 'pending' || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
            onRemove && (
              <Button size="$2" theme="gray" onPress={onRemove}>
                Remove
              </Button>
            )}
        </XStack>
      </YStack>
    </Card>
  );
}
