import { useState, useEffect, useCallback } from 'react';
import { ScrollView, Pressable, ActivityIndicator, useColorScheme } from 'react-native';
import { Sheet, XStack, YStack, Text, H4, Button } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { DeviceFile } from '@/types/device';
import { getFiles } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';
import { PromptDialog } from '@/components/PromptDialog';

interface MoveFileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: DeviceFile | null;
  sourceDir: string;
  onMove: (file: DeviceFile, destFolder: string) => void;
  onCreateFolder: (name: string, parentPath: string) => Promise<void>;
}

export function MoveFileSheet({
  open,
  onOpenChange,
  file,
  sourceDir,
  onMove,
  onCreateFolder,
}: MoveFileSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const connectedDevice = useDeviceStore((s) => s.connectedDevice);

  const [browsePath, setBrowsePath] = useState('/');
  const [directories, setDirectories] = useState<DeviceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [folderPromptOpen, setFolderPromptOpen] = useState(false);

  // Reset to root when sheet opens
  useEffect(() => {
    if (open) {
      setBrowsePath('/');
    }
  }, [open]);

  const loadDirectories = useCallback(
    async (path: string) => {
      if (!connectedDevice) return;
      setIsLoading(true);
      try {
        const allFiles = await getFiles(connectedDevice.ip, path);
        const dirs = allFiles
          .filter((f) => f.isDirectory)
          .sort((a, b) => a.name.localeCompare(b.name));
        setDirectories(dirs);
      } catch {
        setDirectories([]);
      } finally {
        setIsLoading(false);
      }
    },
    [connectedDevice],
  );

  // Load directories when browsePath changes
  useEffect(() => {
    if (open) {
      loadDirectories(browsePath);
    }
  }, [browsePath, open, loadDirectories]);

  const navigateInto = (folderName: string) => {
    const newPath = browsePath === '/' ? `/${folderName}` : `${browsePath}/${folderName}`;
    setBrowsePath(newPath);
  };

  const navigateUp = () => {
    if (browsePath === '/') return;
    const parent = browsePath.substring(0, browsePath.lastIndexOf('/')) || '/';
    setBrowsePath(parent);
  };

  // Normalize paths for comparison (strip trailing slashes)
  const normSourceDir = sourceDir.endsWith('/') ? sourceDir.slice(0, -1) : sourceDir;
  const normBrowsePath = browsePath.endsWith('/') ? browsePath.slice(0, -1) : browsePath;

  // Disable "Move Here" if same dir or moving folder into itself
  const isSameDir = normBrowsePath === normSourceDir || (normBrowsePath === '' && normSourceDir === '/');
  const isMovingIntoSelf =
    file?.isDirectory &&
    normBrowsePath.startsWith(
      (normSourceDir === '/' ? '' : normSourceDir) + '/' + file.name + '/',
    );
  const moveDisabled = isSameDir || !!isMovingIntoSelf;

  const handleMove = () => {
    if (!file || moveDisabled) return;
    onMove(file, browsePath);
    onOpenChange(false);
  };

  const handleCreateFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await onCreateFolder(trimmed, browsePath);
      await loadDirectories(browsePath);
    } catch {
      // Error handled by caller
    }
  };

  const displayPath = browsePath === '/' ? '/ (root)' : browsePath;

  return (
    <>
      <Sheet
        modal
        open={open}
        onOpenChange={onOpenChange}
        snapPoints={[90]}
        dismissOnSnapToBottom
        zIndex={100_001}
        animation="medium"
      >
        <Sheet.Overlay animation="lazy" opacity={0.5} enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
        <Sheet.Handle />
        <Sheet.Frame testID="MoveFile.Sheet">
          <YStack flex={1}>
            {/* Header */}
            <XStack
              justifyContent="space-between"
              alignItems="center"
              paddingHorizontal="$4"
              paddingTop="$3"
              paddingBottom="$2"
            >
              <Button
                chromeless
                size="$3"
                onPress={() => onOpenChange(false)}
                testID="MoveFile.CancelButton"
              >
                <Text color="$blue10" fontSize="$3" fontWeight="500">Cancel</Text>
              </Button>
              <H4>Move to...</H4>
              <XStack gap="$1" alignItems="center">
                <Button
                  chromeless
                  circular
                  size="$3"
                  onPress={() => setFolderPromptOpen(true)}
                  testID="MoveFile.NewFolderButton"
                >
                  <FontAwesome name="folder-open" size={16} color={isDark ? '#6cb4ee' : '#2089dc'} />
                  <FontAwesome name="plus" size={10} color={isDark ? '#6cb4ee' : '#2089dc'} style={{ marginLeft: -4, marginTop: -8 }} />
                </Button>
                <Button
                  chromeless
                  circular
                  size="$3"
                  onPress={() => onOpenChange(false)}
                  testID="MoveFile.CloseButton"
                >
                  <FontAwesome name="times" size={18} color="#999" />
                </Button>
              </XStack>
            </XStack>

            {/* Current path */}
            <XStack paddingHorizontal="$4" paddingBottom="$2">
              <Text color="$gray10" fontSize="$2" numberOfLines={1}>
                {displayPath}
              </Text>
            </XStack>

            {/* Directory list */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {browsePath !== '/' && (
                <Pressable onPress={navigateUp} testID="MoveFile.BackButton">
                  <XStack
                    paddingVertical="$3"
                    gap="$3"
                    alignItems="center"
                    borderBottomWidth={0.5}
                    borderBottomColor={isDark ? '$gray5' : '$gray4'}
                  >
                    <FontAwesome name="arrow-left" size={18} color={isDark ? '#aaa' : '#555'} style={{ width: 24, textAlign: 'center' }} />
                    <Text fontSize="$4" color="$gray10">
                      Back
                    </Text>
                  </XStack>
                </Pressable>
              )}

              {isLoading && (
                <YStack alignItems="center" paddingVertical="$4">
                  <ActivityIndicator size="small" />
                </YStack>
              )}

              {!isLoading && directories.length === 0 && (
                <YStack alignItems="center" paddingVertical="$4">
                  <Text color="$gray9" fontSize="$3">No subfolders</Text>
                </YStack>
              )}

              {!isLoading &&
                directories.map((dir) => (
                  <Pressable
                    key={dir.name}
                    onPress={() => navigateInto(dir.name)}
                    testID={`MoveFile.Folder.${dir.name}`}
                  >
                    <XStack
                      paddingVertical="$3"
                      gap="$3"
                      alignItems="center"
                      borderBottomWidth={0.5}
                      borderBottomColor={isDark ? '$gray5' : '$gray4'}
                    >
                      <FontAwesome
                        name="folder"
                        size={20}
                        color={isDark ? '#ffd54f' : '#f9a825'}
                        style={{ width: 24, textAlign: 'center' }}
                      />
                      <Text flex={1} fontSize="$4" numberOfLines={1}>
                        {dir.name}
                      </Text>
                      <FontAwesome name="chevron-right" size={12} color={isDark ? '#666' : '#ccc'} />
                    </XStack>
                  </Pressable>
                ))}
            </ScrollView>

            {/* Footer */}
            <YStack
              paddingHorizontal="$4"
              paddingVertical="$3"
              borderTopWidth={0.5}
              borderTopColor={isDark ? '$gray5' : '$gray4'}
            >
              <Button
                size="$4"
                theme="blue"
                disabled={moveDisabled}
                opacity={moveDisabled ? 0.5 : 1}
                onPress={handleMove}
                testID="MoveFile.MoveHereButton"
              >
                Move Here
              </Button>
            </YStack>
          </YStack>
        </Sheet.Frame>
      </Sheet>

      <PromptDialog
        open={folderPromptOpen}
        onOpenChange={setFolderPromptOpen}
        title="New Folder"
        message={`Create a new folder in ${displayPath}:`}
        onSubmit={handleCreateFolder}
        submitLabel="Create"
      />
    </>
  );
}
