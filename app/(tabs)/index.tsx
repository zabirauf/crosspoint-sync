import { useCallback, useRef } from 'react';
import { YStack, XStack, Text, Button } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme, Alert, RefreshControl } from 'react-native';
import { FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDeviceStore } from '@/stores/device-store';
import { useFileBrowser } from '@/hooks/use-file-browser';
import { useDocumentPicker } from '@/hooks/use-document-picker';
import { SwipeableFileRow, type SwipeableMethods } from '@/components/SwipeableFileRow';
import { EmptyState } from '@/components/EmptyState';
import { DeviceFile } from '@/types/device';

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { connectionStatus } = useDeviceStore();
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

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
    downloadFileFromDevice,
  } = useFileBrowser();

  const { pickAndQueueFiles } = useDocumentPicker();

  const isConnected = connectionStatus === 'connected';

  // Refresh file list whenever the tab gains focus
  useFocusEffect(
    useCallback(() => {
      if (isConnected) {
        loadFiles();
      }
    }, [isConnected, loadFiles])
  );

  if (!isConnected) {
    return (
      <EmptyState
        icon="plug"
        title="No Device Connected"
        subtitle="Go to the Sync tab to connect to your e-ink reader."
      />
    );
  }

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

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Breadcrumb header */}
      <YStack padding="$3" gap="$2" borderBottomWidth={0.5} borderBottomColor={isDark ? '$gray5' : '$gray4'}>
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          {currentPath !== '/' && (
            <Button size="$2" chromeless onPress={navigateUp} icon={<FontAwesome name="arrow-left" size={14} color={isDark ? '#ccc' : '#666'} />}>
              Back
            </Button>
          )}
          <Text color="$gray10" fontSize="$3" numberOfLines={1} flex={1}>
            /{pathParts.join('/')}
          </Text>
        </XStack>
        <XStack gap="$2">
          <Button
            size="$2"
            theme="blue"
            flex={1}
            onPress={() => pickAndQueueFiles(currentPath)}
            icon={<FontAwesome name="plus" size={12} color="#fff" />}
          >
            Add Book
          </Button>
          <Button
            size="$2"
            flex={1}
            onPress={handleNewFolder}
            icon={<FontAwesome name="folder" size={12} color={isDark ? '#ccc' : '#666'} />}
          >
            New Folder
          </Button>
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
        renderItem={({ item }) => (
          <SwipeableFileRow
            file={item}
            onPress={() => {
              if (item.isDirectory) {
                navigateToFolder(item.name);
              }
            }}
            onDelete={handleDelete}
            onDownload={downloadFileFromDevice}
            onSwipeOpen={handleSwipeOpen}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => loadFiles()} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="folder-open-o"
              title="Empty Folder"
              subtitle="Add books or create a new folder to get started."
            />
          ) : null
        }
      />
    </YStack>
  );
}
