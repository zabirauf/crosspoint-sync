import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from 'tamagui';
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
  onRename?: (file: DeviceFile) => void;
  onLongPress?: (file: DeviceFile) => void;
  onMorePress?: (file: DeviceFile) => void;
  onSwipeOpen: (methods: SwipeableMethods) => void;
  downloadStatus?: 'downloading' | 'queued';
}

const ACTION_WIDTH = 80;

function RightActions({
  file,
  onDelete,
  onRename,
  translation,
  closeFn,
}: {
  file: DeviceFile;
  onDelete: (file: DeviceFile) => void;
  onRename?: (file: DeviceFile) => void;
  translation: SharedValue<number>;
  closeFn: () => void;
}) {
  const showRename = !file.isDirectory && onRename;
  const fileActions = showRename ? 2 : 1;
  const totalWidth = ACTION_WIDTH * fileActions;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: Math.max(0, totalWidth + translation.value),
      },
    ],
  }));

  return (
    <Reanimated.View style={[styles.actionsContainer, { width: totalWidth }, animatedStyle]}>
      {showRename && (
        <RectButton
          style={[styles.actionButton, styles.renameButton]}
          onPress={() => {
            closeFn();
            onRename(file);
          }}
        >
          <FontAwesome name="pencil" size={20} color="#fff" />
          <Text style={styles.actionText}>Rename</Text>
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
  onRename,
  onLongPress,
  onMorePress,
  onSwipeOpen,
  downloadStatus,
}: SwipeableFileRowProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const theme = useTheme();

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      enabled={!downloadStatus}
      renderRightActions={(_progress, translation) => (
        <RightActions
          file={file}
          onDelete={onDelete}
          onRename={onRename}
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
      <View style={{ backgroundColor: theme.background.val }}>
        <FileRow
          file={file}
          onPress={onPress}
          onLongPress={onLongPress ? () => onLongPress(file) : undefined}
          onMorePress={onMorePress ? () => onMorePress(file) : undefined}
          downloadStatus={downloadStatus}
        />
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
  renameButton: {
    backgroundColor: '#FF9500',
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
