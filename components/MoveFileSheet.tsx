import { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, Pressable, ActivityIndicator, useColorScheme, TextInput, View } from 'react-native';
import { Sheet, XStack, YStack, Text, H4, Button, Input } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { DeviceFile } from '@/types/device';
import { getFiles } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';

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

  const [browsePath, setBrowsePath] = useState(sourceDir);
  const [directories, setDirectories] = useState<DeviceFile[]>([]);
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [folderPromptOpen, setFolderPromptOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const folderInputRef = useRef<TextInput>(null);
  const breadcrumbRef = useRef<ScrollView>(null);

  const pathParts = browsePath.split('/').filter(Boolean);

  // Auto-scroll breadcrumbs to the end when path changes
  useEffect(() => {
    setTimeout(() => {
      breadcrumbRef.current?.scrollToEnd?.({ animated: true });
    }, 50);
  }, [browsePath]);

  // Focus the folder name input after it mounts inside the sheet
  useEffect(() => {
    if (folderPromptOpen) {
      const timer = setTimeout(() => folderInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [folderPromptOpen]);

  // Reset to the user's current folder when sheet opens
  useEffect(() => {
    if (open) {
      setDirectories([]);
      setFiles([]);
      setBrowsePath(sourceDir);
    }
  }, [open, sourceDir]);

  const loadDirectories = useCallback(
    async (path: string) => {
      if (!connectedDevice) return;
      setIsLoading(true);
      try {
        const allFiles = await getFiles(connectedDevice.ip, path);
        const dirs = allFiles
          .filter((f) => f.isDirectory)
          .sort((a, b) => a.name.localeCompare(b.name));
        const nonDirs = allFiles
          .filter((f) => !f.isDirectory)
          .sort((a, b) => a.name.localeCompare(b.name));
        setDirectories(dirs);
        setFiles(nonDirs);
      } catch {
        setDirectories([]);
        setFiles([]);
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

  const handleCreateFolder = async () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;
    try {
      await onCreateFolder(trimmed, browsePath);
      setFolderPromptOpen(false);
      setFolderName('');
      await loadDirectories(browsePath);
    } catch {
      // Error handled by caller
    }
  };

  const cancelFolderPrompt = () => {
    setFolderPromptOpen(false);
    setFolderName('');
  };

  return (
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

            {/* Breadcrumb navigation */}
            <YStack borderBottomWidth={0.5} borderBottomColor={isDark ? '$gray5' : '$gray4'}>
              <ScrollView
                ref={breadcrumbRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' }}
              >
                <XStack alignItems="center" gap="$1.5">
                  {/* Root segment */}
                  {pathParts.length > 0 ? (
                    <Text
                      color="$blue10"
                      fontSize="$3"
                      fontWeight="500"
                      onPress={() => setBrowsePath('/')}
                    >
                      <FontAwesome name="tablet" size={13} color={isDark ? '#6cb4ee' : '#2089dc'} />{' '}
                      Device
                    </Text>
                  ) : (
                    <Text color="$colorFocus" fontSize="$3" fontWeight="600">
                      <FontAwesome name="tablet" size={13} />{' '}
                      Device
                    </Text>
                  )}

                  {/* Path segments */}
                  {pathParts.map((part, index) => {
                    const isLast = index === pathParts.length - 1;
                    const segmentPath = '/' + pathParts.slice(0, index + 1).join('/');
                    return (
                      <XStack key={segmentPath} alignItems="center" gap="$1.5">
                        <Text color={isDark ? '$gray8' : '$gray9'} fontSize="$3">
                          ›
                        </Text>
                        {isLast ? (
                          <Text color="$colorFocus" fontSize="$3" fontWeight="600">
                            {part}
                          </Text>
                        ) : (
                          <Text
                            color="$blue10"
                            fontSize="$3"
                            fontWeight="500"
                            onPress={() => setBrowsePath(segmentPath)}
                          >
                            {part}
                          </Text>
                        )}
                      </XStack>
                    );
                  })}
                </XStack>
              </ScrollView>
            </YStack>

            {/* Inline new folder input */}
            {folderPromptOpen && (
              <XStack
                paddingHorizontal="$4"
                paddingBottom="$2"
                gap="$2"
                alignItems="center"
              >
                <Input
                  ref={folderInputRef as any}
                  flex={1}
                  size="$4"
                  placeholder="Folder name"
                  value={folderName}
                  onChangeText={setFolderName}
                  onSubmitEditing={handleCreateFolder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="MoveFile.FolderNameInput"
                />
                <Button size="$3" theme="blue" onPress={handleCreateFolder} testID="MoveFile.CreateFolderButton">
                  Create
                </Button>
                <Button size="$3" chromeless onPress={cancelFolderPrompt}>
                  <FontAwesome name="times" size={14} color="#999" />
                </Button>
              </XStack>
            )}

            {/* Directory list */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {isLoading && (
                <YStack alignItems="center" paddingVertical="$4">
                  <ActivityIndicator size="small" />
                </YStack>
              )}

              {!isLoading && directories.length === 0 && files.length === 0 && (
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

              {!isLoading &&
                files.map((f) => (
                  <View
                    key={f.name}
                    style={{ opacity: 0.35 }}
                    testID={`MoveFile.GhostedFile.${f.name}`}
                  >
                    <XStack
                      paddingVertical="$3"
                      gap="$3"
                      alignItems="center"
                      borderBottomWidth={0.5}
                      borderBottomColor={isDark ? '$gray5' : '$gray4'}
                    >
                      <FontAwesome
                        name={f.isEpub ? 'book' : f.name.toLowerCase().endsWith('.pdf') ? 'file-pdf-o' : 'file-o'}
                        size={20}
                        color={
                          f.isEpub
                            ? (isDark ? '#81d4fa' : '#1a73e8')
                            : (isDark ? '#ccc' : '#666')
                        }
                        style={{ width: 24, textAlign: 'center' }}
                      />
                      <Text flex={1} fontSize="$4" numberOfLines={1}>
                        {f.name}
                      </Text>
                      <Text color="$gray10" fontSize="$2">
                        {f.size < 1024
                          ? `${f.size} B`
                          : f.size < 1024 * 1024
                            ? `${(f.size / 1024).toFixed(1)} KB`
                            : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
                      </Text>
                    </XStack>
                  </View>
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

  );
}
