import { useCallback, useRef, useState, useLayoutEffect, useEffect } from 'react';
import { YStack, XStack, Text, ScrollView } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme, Alert, Platform, BackHandler, RefreshControl, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFileBrowser } from '@/hooks/use-file-browser';
import { useDocumentPicker } from '@/hooks/use-document-picker';
import { SwipeableFileRow, type SwipeableMethods } from '@/components/SwipeableFileRow';
import { EmptyState } from '@/components/EmptyState';
import { ConnectionPill } from '@/components/ConnectionPill';
import { ConnectionSheet } from '@/components/ConnectionSheet';
import { UploadStatusBar } from '@/components/UploadStatusBar';
import { UploadQueueSheet } from '@/components/UploadQueueSheet';
import { ActionFAB } from '@/components/ActionFAB';
import { SwipeBackGesture } from '@/components/SwipeBackGesture';
import { PromptDialog } from '@/components/PromptDialog';
import { DeviceFile } from '@/types/device';

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigation = useNavigation();
  const { connectionStatus } = useDeviceStore();
  const { jobs } = useUploadStore();
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  const [connectionSheetOpen, setConnectionSheetOpen] = useState(false);
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);
  const [folderPromptOpen, setFolderPromptOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DeviceFile | null>(null);

  const {
    currentPath,
    files,
    isLoading,
    error,
    capabilities,
    loadFiles,
    navigateToFolder,
    navigateUp,
    navigateToPath,
    createNewFolder,
    deleteFileOrFolder,
    renameFileOnDevice,
    downloadingFile,
    queuedDownloads,
    queueDownload,
  } = useFileBrowser();

  const { pickAndQueueFiles } = useDocumentPicker();
  const { defaultUploadPath } = useSettingsStore();

  const isConnected = connectionStatus === 'connected';
  const hasActiveUploads = jobs.some(j =>
    j.status === 'processing' || j.status === 'uploading' || j.status === 'pending' ||
    j.status === 'conflict' || j.status === 'failed' || j.status === 'cancelled'
  );

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
        ? 'This will delete the folder from the device.'
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
    setFolderPromptOpen(true);
  };

  // Android hardware back button navigates up in file browser
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      const onBackPress = () => {
        if (isConnected && currentPath !== '/') {
          navigateUp();
          return true;
        }
        return false;
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [isConnected, currentPath, navigateUp])
  );

  const handleSleepBackground = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    router.push({ pathname: '/sleep-preview', params: { imageUri: asset.uri } });
  }, []);

  const pathParts = currentPath.split('/').filter(Boolean);
  const breadcrumbRef = useRef<any>(null);

  // Auto-scroll breadcrumbs to the end when path changes
  useEffect(() => {
    setTimeout(() => {
      breadcrumbRef.current?.scrollToEnd?.({ animated: true });
    }, 50);
  }, [currentPath]);

  return (
    <YStack flex={1} backgroundColor="$background" testID="Library.Screen">
      {isConnected ? (
        <SwipeBackGesture
          onSwipeBack={navigateUp}
          enabled={isConnected && currentPath !== '/'}
          resetKey={currentPath}
        >
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
                    onPress={() => navigateToPath('/')}
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
                          onPress={() => navigateToPath(segmentPath)}
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

          {error && (
            <YStack padding="$3">
              <Text color="$red10" fontSize="$3">{error}</Text>
            </YStack>
          )}

          {/* File list */}
          <FlatList
            testID="Library.FileList"
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
                  onRename={capabilities.rename ? (file) => setRenameTarget(file) : undefined}
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
        </SwipeBackGesture>
      ) : (
        <EmptyState
          icon="plug"
          title="No Device Connected"
          subtitle="Connect to your e-ink reader to browse and manage books."
          actionLabel="Connect"
          onAction={() => setConnectionSheetOpen(true)}
        />
      )}

      {/* Upload status bar */}
      <UploadStatusBar onPress={() => setQueueSheetOpen(true)} />

      {/* Floating action button */}
      <ActionFAB
        onAddBook={() => pickAndQueueFiles(isConnected ? currentPath : defaultUploadPath)}
        onNewFolder={handleNewFolder}
        onSleepBackground={handleSleepBackground}
        showNewFolder={isConnected}
        bottomOffset={hasActiveUploads ? 72 : 16}
      />

      {/* Sheets */}
      {connectionSheetOpen && (
        <ConnectionSheet open={connectionSheetOpen} onOpenChange={setConnectionSheetOpen} />
      )}
      {queueSheetOpen && (
        <UploadQueueSheet open={queueSheetOpen} onOpenChange={setQueueSheetOpen} />
      )}

      {/* New folder prompt */}
      <PromptDialog
        open={folderPromptOpen}
        onOpenChange={setFolderPromptOpen}
        title="New Folder"
        message="Enter a name for the new folder:"
        onSubmit={(name) => {
          if (name.trim()) {
            createNewFolder(name.trim());
          }
        }}
        submitLabel="Create"
      />

      {/* Rename file prompt */}
      <PromptDialog
        open={renameTarget !== null}
        onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
        title="Rename File"
        message={`Enter a new name for "${renameTarget?.name ?? ''}":`}
        defaultValue={renameTarget?.name ?? ''}
        onSubmit={(newName) => {
          const trimmed = newName.trim();
          if (renameTarget && trimmed && trimmed !== renameTarget.name) {
            renameFileOnDevice(renameTarget, trimmed);
          }
        }}
        submitLabel="Rename"
      />
    </YStack>
  );
}
