import { ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Text, YStack } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { getReaderName } from '@/constants/ReaderProfiles';
import { LIBRARY_CONTEXT_PANEL_WIDTH } from '@/constants/Layout';

export function LibraryContext({ onConnect, onQueue }: { onConnect: () => void; onQueue: () => void }) {
  const { connectedDevice, connectionStatus, deviceStatus } = useDeviceStore();
  const jobs = useUploadStore((state) => state.jobs);
  const isDark = useColorScheme() === 'dark';
  const connected = connectionStatus === 'connected';
  const waiting = jobs.filter((job) => job.status === 'pending' || job.status === 'processing').length;
  const uploading = jobs.some((job) => job.status === 'uploading');
  const attention = jobs.filter((job) => ['failed', 'conflict', 'cancelled'].includes(job.status)).length;
  return (
    <View style={[styles.panel, { borderColor: isDark ? '#333' : '#e6e6e6' }]} testID="Library.ContextPanel">
      <ScrollView contentContainerStyle={styles.content}>
        <YStack gap="$3">
          <FontAwesome testID="Library.ReaderIcon" name="tablet" size={30} color={isDark ? '#81d4fa' : '#1a73e8'} />
          <Text testID="Library.ReaderHeading" fontSize="$5" fontWeight="600">Your reader</Text>
          <Text fontSize="$3" color="$gray11" testID="Library.ReaderName">
            {connected && connectedDevice ? getReaderName(deviceStatus?.device, connectedDevice.hostname) : 'Connect your reader to browse its library.'}
          </Text>
          <Button size="$4" onPress={onConnect} testID="Library.ManageConnection">
            {connected ? 'Connection' : 'Connect reader'}
          </Button>
          <View style={{ height: 16 }} />
          <Text testID="Library.UploadHeading" fontSize="$4" fontWeight="600">Uploads</Text>
          <Text fontSize="$3" color="$gray11" testID="Library.QueueSummary">
            {uploading ? 'Transfer in progress' : attention ? `${attention} need attention` : waiting ? `${waiting} waiting` : 'No uploads waiting'}
          </Text>
          <Button size="$4" chromeless onPress={onQueue} testID="Library.OpenQueue">View queue</Button>
        </YStack>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: LIBRARY_CONTEXT_PANEL_WIDTH, borderRightWidth: StyleSheet.hairlineWidth },
  content: { padding: 20 },
});
