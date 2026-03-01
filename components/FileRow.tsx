import { XStack, YStack, Text } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, useColorScheme } from 'react-native';
import { DeviceFile } from '@/types/device';
import { formatSize } from '@/utils/format';

interface FileRowProps {
  file: DeviceFile;
  onPress: () => void;
  onLongPress?: () => void;
  onMorePress?: () => void;
  downloadStatus?: 'downloading' | 'queued';
}

function fileIcon(file: DeviceFile): React.ComponentProps<typeof FontAwesome>['name'] {
  if (file.isDirectory) return 'folder';
  if (file.isEpub) return 'book';
  if (file.name.toLowerCase().endsWith('.pdf')) return 'file-pdf-o';
  return 'file-o';
}

function fileColor(file: DeviceFile, isDark: boolean): string {
  if (file.isDirectory) return isDark ? '#ffd54f' : '#f9a825';
  if (file.isEpub) return isDark ? '#81d4fa' : '#1a73e8';
  return isDark ? '#ccc' : '#666';
}

export function FileRow({ file, onPress, onLongPress, onMorePress, downloadStatus }: FileRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const renderTrailing = () => {
    if (file.isDirectory) {
      return <FontAwesome name="chevron-right" size={12} color={isDark ? '#666' : '#ccc'} />;
    }
    if (downloadStatus === 'downloading') {
      return (
        <XStack gap="$1.5" alignItems="center">
          <ActivityIndicator size="small" color="#007AFF" />
          <Text color="#007AFF" fontSize="$2">Saving...</Text>
        </XStack>
      );
    }
    if (downloadStatus === 'queued') {
      return (
        <XStack gap="$1.5" alignItems="center">
          <FontAwesome name="clock-o" size={14} color={isDark ? '#888' : '#999'} />
          <Text color={isDark ? '$gray9' : '$gray10'} fontSize="$2">Queued</Text>
        </XStack>
      );
    }
    return (
      <Text color="$gray10" fontSize="$2">
        {formatSize(file.size)}
      </Text>
    );
  };

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} testID={`Library.FileRow.${file.name}`}>
      <XStack
        paddingVertical="$3"
        paddingHorizontal="$2"
        gap="$3"
        alignItems="center"
        borderBottomWidth={0.5}
        borderBottomColor={isDark ? '$gray5' : '$gray4'}
      >
        <FontAwesome
          name={fileIcon(file)}
          size={22}
          color={fileColor(file, isDark)}
        />
        <YStack flex={1}>
          <Text fontSize="$4" numberOfLines={1}>
            {file.name}
          </Text>
        </YStack>
        {renderTrailing()}
        {onMorePress && (
          <Pressable
            onPress={onMorePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={`Library.FileRow.${file.name}.More`}
            style={{ paddingLeft: 8 }}
          >
            <FontAwesome name="ellipsis-v" size={18} color={isDark ? '#999' : '#666'} />
          </Pressable>
        )}
      </XStack>
    </Pressable>
  );
}
