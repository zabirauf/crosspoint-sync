import { Sheet, YStack, XStack, Text, H4, Button, Separator } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { ScrollView } from 'react-native';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useDeviceStore } from '@/stores/device-store';
import { useDocumentPicker } from '@/hooks/use-document-picker';
import { cancelCurrentUploadJob } from '@/services/upload-queue';
import { UploadJobCard } from '@/components/UploadJobCard';

interface UploadQueueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadQueueSheet({ open, onOpenChange }: UploadQueueSheetProps) {
  const { jobs } = useUploadStore();
  const { removeJob, retryJob, resolveConflict } = useUploadStore();
  const { defaultUploadPath } = useSettingsStore();
  const { connectionStatus } = useDeviceStore();
  const { pickAndQueueFiles } = useDocumentPicker();

  const isConnected = connectionStatus === 'connected';
  const processingJobs = jobs.filter((j) => j.status === 'processing');
  const activeJob = jobs.find((j) => j.status === 'uploading');
  const pendingJobs = jobs.filter((j) => j.status === 'pending');
  const conflictJobs = jobs.filter((j) => j.status === 'conflict');
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedJobs = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');

  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[80]}
      dismissOnSnapToBottom
      zIndex={100_000}
      animation="medium"
    >
      <Sheet.Overlay animation="lazy" opacity={0.5} enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
      <Sheet.Handle />
      <Sheet.Frame padding="$4" testID="UploadQueue.Sheet">
        <Sheet.ScrollView>
          <YStack gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <H4>Upload Queue</H4>
              {completedCount > 0 && (
                <Text color="$gray10" fontSize="$2">
                  {completedCount} completed
                </Text>
              )}
            </XStack>

            <Separator />

            {/* Processing jobs (article clipping in progress) */}
            {processingJobs.map((job) => (
              <UploadJobCard
                key={job.id}
                job={job}
                onRemove={() => removeJob(job.id)}
              />
            ))}

            {/* Active upload */}
            {activeJob && (
              <UploadJobCard
                job={activeJob}
                onCancel={() => cancelCurrentUploadJob()}
              />
            )}

            {(activeJob || processingJobs.length > 0 || pendingJobs.length > 0) && (
              <XStack gap="$2" alignItems="center" paddingVertical="$1">
                <FontAwesome name="info-circle" size={14} color="#f5a623" />
                <Text color="$gray10" fontSize="$2" flexShrink={1}>
                  Keep the app open while uploading. Backgrounding will pause and restart transfers.
                </Text>
              </XStack>
            )}

            {/* Pending jobs */}
            {pendingJobs.map((job) => (
              <UploadJobCard
                key={job.id}
                job={job}
                onRemove={() => removeJob(job.id)}
              />
            ))}

            {/* Conflict jobs */}
            {conflictJobs.length > 0 && (
              <XStack gap="$2" alignItems="center" paddingTop="$2">
                <FontAwesome name="warning" size={14} color="#f5a623" />
                <Text color="$yellow10" fontSize="$3" fontWeight="600">
                  Conflicts
                </Text>
              </XStack>
            )}
            {conflictJobs.map((job) => (
              <UploadJobCard
                key={job.id}
                job={job}
                onOverwrite={() => resolveConflict(job.id, 'overwrite')}
                onRemove={() => resolveConflict(job.id, 'remove')}
              />
            ))}

            {/* Failed/cancelled jobs */}
            {failedJobs.map((job) => (
              <UploadJobCard
                key={job.id}
                job={job}
                onRetry={() => retryJob(job.id)}
                onRemove={() => removeJob(job.id)}
              />
            ))}

            {!activeJob && processingJobs.length === 0 && pendingJobs.length === 0 && conflictJobs.length === 0 && failedJobs.length === 0 && (
              <Text color="$gray10" fontSize="$3" textAlign="center" paddingVertical="$2">
                No uploads in queue
              </Text>
            )}

            <Button
              size="$4"
              theme="blue"
              icon={<FontAwesome name="plus" size={16} color="#fff" />}
              onPress={() => pickAndQueueFiles(defaultUploadPath)}
            >
              Add Books
            </Button>

            {!isConnected && pendingJobs.length > 0 && (
              <Text color="$gray10" fontSize="$2" textAlign="center">
                Books will upload when a device connects
              </Text>
            )}


          </YStack>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  );
}
