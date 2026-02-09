import { useCallback, useRef, useState, useLayoutEffect } from 'react';
import { YStack, XStack, Text } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme, Alert, RefreshControl, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useDeviceStore } from '@/stores/device-store';
import { useFileBrowser } from '@/hooks/use-file-browser';
import { useDocumentPicker } from '@/hooks/use-document-picker';
import { SwipeableFileRow, type SwipeableMethods } from '@/components/SwipeableFileRow';
import { EmptyState } from '@/components/EmptyState';
import { ConnectionPill } from '@/components/ConnectionPill';
import { ConnectionSheet } from '@/components/ConnectionSheet';
import { UploadStatusBar } from '@/components/UploadStatusBar';
import { UploadQueueSheet } from '@/components/UploadQueueSheet';
import { AddBookFAB } from '@/components/AddBookFAB';
import { DeviceFile } from '@/types/device';

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigation = useNavigation();
  const { connectionStatus } = useDeviceStore();
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  const [connectionSheetOpen, setConnectionSheetOpen] = useState(false);
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);

  const {
    currentPath,
    files,
    isLoading,
    error,
    loadFiles,
    navigateToFolder,
    navigateUp,
    createNewFolder,
    deleteFileOrFolder,
    downloadingFile,
    queuedDownloads,
    queueDownload,
  } = useFileBrowser();

  const { pickAndQueueFiles } = useDocumentPicker();

  const isConnected = connectionStatus === 'connected';

  // Place ConnectionPill in the header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ConnectionPill onPress={() => setConnectionSheetOpen(true)} />
      ),
    });
  }, [navigation]);

  // Refresh file list whenever the tab gains focus
  useFocusEffect(
    useCallback(() => {
      if (isConnected) {
        loadFiles();
      }
    }, [isConnected, loadFiles])
  );

  const handleDelete = (file: DeviceFile) => {
    Alert.alert(
      `Delete "${file.name}"?`,
      file.isDirectory
        ? 'This will delete the folder and all its contents.'
        : 'This file will be permanently removed from the device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteFileOrFolder(file),
        },
      ],
    );
  };

  const handleSwipeOpen = (methods: SwipeableMethods) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== methods) {
      openSwipeableRef.current.close();
    }
    openSwipeableRef.current = methods;
  };

  const handleNewFolder = () => {
    Alert.prompt(
      'New Folder',
      'Enter a name for the new folder:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: (name?: string) => {
            if (name?.trim()) {
              createNewFolder(name.trim());
            }
          },
        },
      ],
      'plain-text',
    );
  };

  if (!isConnected) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState
          icon="plug"
          title="No Device Connected"
          subtitle="Connect to your e-ink reader to browse and manage books."
          actionLabel="Connect"
          onAction={() => setConnectionSheetOpen(true)}
        />
        <ConnectionSheet open={connectionSheetOpen} onOpenChange={setConnectionSheetOpen} />
      </View>
    );
  }

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Breadcrumb navigation */}
      <YStack paddingHorizontal="$3" paddingVertical="$2" borderBottomWidth={0.5} borderBottomColor={isDark ? '$gray5' : '$gray4'}>
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          {currentPath !== '/' && (
            <FontAwesome
              name="arrow-left"
              size={14}
              color={isDark ? '#ccc' : '#666'}
              onPress={navigateUp}
            />
          )}
          <Text color="$gray10" fontSize="$3" numberOfLines={1} flex={1}>
            /{pathParts.join('/')}
          </Text>
        </XStack>
      </YStack>

      {error && (
        <YStack padding="$3">
          <Text color="$red10" fontSize="$3">{error}</Text>
        </YStack>
      )}

      {/* File list */}
      <FlatList
        data={files}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => {
          const downloadStatus = downloadingFile === item.name
            ? 'downloading' as const
            : queuedDownloads.includes(item.name)
              ? 'queued' as const
              : undefined;
          return (
            <SwipeableFileRow
              file={item}
              onPress={() => {
                if (item.isDirectory) {
                  navigateToFolder(item.name);
                }
              }}
              onDelete={handleDelete}
              onDownload={queueDownload}
              onSwipeOpen={handleSwipeOpen}
              downloadStatus={downloadStatus}
            />
          );
        }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => loadFiles()} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="folder-open-o"
              title="Empty Folder"
              subtitle="Tap + to add books or long press to create a folder."
            />
          ) : null
        }
      />

      {/* Upload status bar */}
      <UploadStatusBar onPress={() => setQueueSheetOpen(true)} />

      {/* Floating action button */}
      <AddBookFAB
        onAddBook={() => pickAndQueueFiles(currentPath)}
        onNewFolder={handleNewFolder}
        bottomOffset={80}
      />

      {/* Sheets */}
      <ConnectionSheet open={connectionSheetOpen} onOpenChange={setConnectionSheetOpen} />
      <UploadQueueSheet open={queueSheetOpen} onOpenChange={setQueueSheetOpen} />
    </YStack>
  );
}
