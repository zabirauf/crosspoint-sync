import { ScrollView, Pressable, useColorScheme } from 'react-native';
import { Sheet, XStack, YStack, Text, H4, Button } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { DeviceFile } from '@/types/device';

interface FileActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: DeviceFile | null;
  capabilities: { rename: boolean; move: boolean };
  onSave: (file: DeviceFile) => void;
  onMove: (file: DeviceFile) => void;
  onRename: (file: DeviceFile) => void;
  onDelete: (file: DeviceFile) => void;
}

function ActionRow({
  icon,
  label,
  onPress,
  testID,
  destructive,
  isDark,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
  testID: string;
  destructive?: boolean;
  isDark: boolean;
}) {
  const color = destructive ? '#FF3B30' : isDark ? '#fff' : '#000';
  const iconColor = destructive ? '#FF3B30' : isDark ? '#aaa' : '#555';

  return (
    <Pressable onPress={onPress} testID={testID}>
      <XStack
        paddingVertical="$3"
        paddingHorizontal="$2"
        gap="$3"
        alignItems="center"
        borderBottomWidth={0.5}
        borderBottomColor={isDark ? '$gray5' : '$gray4'}
      >
        <FontAwesome name={icon} size={20} color={iconColor} style={{ width: 24, textAlign: 'center' }} />
        <Text color={color} fontSize="$4" fontWeight="500">
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileActionSheet({
  open,
  onOpenChange,
  file,
  capabilities,
  onSave,
  onMove,
  onRename,
  onDelete,
}: FileActionSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const closeAndDo = (callback: (f: DeviceFile) => void) => {
    if (!file) return;
    const target = file;
    onOpenChange(false);
    setTimeout(() => callback(target), 200);
  };

  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[45]}
      dismissOnSnapToBottom
      zIndex={100_000}
      animation="medium"
    >
      <Sheet.Overlay animation="lazy" opacity={0.5} enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
      <Sheet.Handle />
      <Sheet.Frame padding="$4" testID="FileActions.Sheet">
        <ScrollView>
          <YStack gap="$2">
            {/* Header */}
            <XStack justifyContent="space-between" alignItems="center">
              <YStack flex={1} marginRight="$2">
                <H4 numberOfLines={1}>{file?.name ?? ''}</H4>
                <Text color="$gray10" fontSize="$2">
                  {file?.isDirectory ? 'Folder' : formatSize(file?.size ?? 0)}
                </Text>
              </YStack>
              <Button
                chromeless
                circular
                size="$3"
                onPress={() => onOpenChange(false)}
                testID="FileActions.CloseButton"
              >
                <FontAwesome name="times" size={18} color="#999" />
              </Button>
            </XStack>

            {/* Actions */}
            <YStack>
              {!file?.isDirectory && (
                <ActionRow
                  icon="download"
                  label="Save to Device"
                  onPress={() => closeAndDo(onSave)}
                  testID="FileActions.Save"
                  isDark={isDark}
                />
              )}
              {capabilities.move && (
                <ActionRow
                  icon="folder-open"
                  label="Move"
                  onPress={() => closeAndDo(onMove)}
                  testID="FileActions.Move"
                  isDark={isDark}
                />
              )}
              {!file?.isDirectory && capabilities.rename && (
                <ActionRow
                  icon="pencil"
                  label="Rename"
                  onPress={() => closeAndDo(onRename)}
                  testID="FileActions.Rename"
                  isDark={isDark}
                />
              )}
              <ActionRow
                icon="trash"
                label="Delete"
                onPress={() => closeAndDo(onDelete)}
                testID="FileActions.Delete"
                destructive
                isDark={isDark}
              />
            </YStack>
          </YStack>
        </ScrollView>
      </Sheet.Frame>
    </Sheet>
  );
}
