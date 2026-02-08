import { useRef } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { RectButton } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { FontAwesome } from '@expo/vector-icons';
import { DeviceFile } from '@/types/device';
import { FileRow } from './FileRow';

interface SwipeableFileRowProps {
  file: DeviceFile;
  onPress: () => void;
  onDelete: (file: DeviceFile) => void;
  onDownload: (file: DeviceFile) => void;
  onSwipeOpen: (methods: SwipeableMethods) => void;
  downloadStatus?: 'downloading' | 'queued';
}

const ACTION_WIDTH = 80;

function RightActions({
  file,
  onDelete,
  onDownload,
  translation,
  closeFn,
}: {
  file: DeviceFile;
  onDelete: (file: DeviceFile) => void;
  onDownload: (file: DeviceFile) => void;
  translation: SharedValue<number>;
  closeFn: () => void;
}) {
  const totalWidth = file.isDirectory ? ACTION_WIDTH : ACTION_WIDTH * 2;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: Math.max(0, totalWidth + translation.value),
      },
    ],
  }));

  return (
    <Reanimated.View style={[styles.actionsContainer, { width: totalWidth }, animatedStyle]}>
      {!file.isDirectory && (
        <RectButton
          style={[styles.actionButton, styles.downloadButton]}
          onPress={() => {
            closeFn();
            onDownload(file);
          }}
        >
          <FontAwesome name="download" size={20} color="#fff" />
          <Text style={styles.actionText}>Save</Text>
        </RectButton>
      )}
      <RectButton
        style={[styles.actionButton, styles.deleteButton]}
        onPress={() => {
          closeFn();
          onDelete(file);
        }}
      >
        <FontAwesome name="trash" size={20} color="#fff" />
        <Text style={styles.actionText}>Delete</Text>
      </RectButton>
    </Reanimated.View>
  );
}

export function SwipeableFileRow({
  file,
  onPress,
  onDelete,
  onDownload,
  onSwipeOpen,
  downloadStatus,
}: SwipeableFileRowProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      enabled={!downloadStatus}
      renderRightActions={(_progress, translation) => (
        <RightActions
          file={file}
          onDelete={onDelete}
          onDownload={onDownload}
          translation={translation}
          closeFn={() => swipeableRef.current?.close()}
        />
      )}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) {
          onSwipeOpen(swipeableRef.current);
        }
      }}
    >
      <View style={{ backgroundColor: isDark ? '#000' : '#fff' }}>
        <FileRow file={file} onPress={onPress} downloadStatus={downloadStatus} />
      </View>
    </ReanimatedSwipeable>
  );
}

export type { SwipeableMethods };

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
  },
  actionButton: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  downloadButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
