import { useState, useEffect, useCallback } from 'react';
import { FlatList, useColorScheme, Alert } from 'react-native';
import { YStack, XStack, Text, Button } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { LogEntry, LogCategory, getLogs, clearLogs, subscribeToLogs } from '@/services/logger';

const CATEGORY_COLORS: Record<LogCategory, string> = {
  discovery: '#3B82F6',
  connection: '#8B5CF6',
  api: '#22C55E',
  upload: '#F59E0B',
  queue: '#EF4444',
  store: '#6366F1',
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toTimeString().slice(0, 8); // HH:MM:SS
}

function formatEntry(entry: LogEntry): string {
  return `[${formatTime(entry.timestamp)}] [${entry.category.toUpperCase()}] ${entry.message}`;
}

export default function DebugLogsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [logs, setLogs] = useState<LogEntry[]>(getLogs);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeToLogs(() => {
      setLogs(getLogs());
    });
    return unsubscribe;
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCopyAll = useCallback(async () => {
    const text = logs.map(formatEntry).join('\n');
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${logs.length} log entries copied to clipboard.`);
  }, [logs]);

  const handleCopySelected = useCallback(async () => {
    const selected = logs.filter((e) => selectedIds.has(e.id));
    if (selected.length === 0) {
      Alert.alert('No Selection', 'Tap log entries to select them first.');
      return;
    }
    const text = selected.map(formatEntry).join('\n');
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${selected.length} log entries copied to clipboard.`);
  }, [logs, selectedIds]);

  const handleClear = useCallback(() => {
    Alert.alert('Clear Logs', 'Are you sure you want to clear all logs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearLogs();
          setSelectedIds(new Set());
        },
      },
    ]);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LogEntry }) => {
      const isSelected = selectedIds.has(item.id);
      return (
        <XStack
          paddingVertical="$1.5"
          paddingHorizontal="$3"
          gap="$2"
          alignItems="flex-start"
          backgroundColor={isSelected ? (isDark ? '$gray4' : '$gray3') : 'transparent'}
          onPress={() => toggleSelection(item.id)}
          pressStyle={{ opacity: 0.7 }}
        >
          <Text fontSize={11} color="$gray10" fontFamily="$mono" flexShrink={0}>
            {formatTime(item.timestamp)}
          </Text>
          <Text
            fontSize={10}
            fontWeight="700"
            color={CATEGORY_COLORS[item.category]}
            flexShrink={0}
            width={80}
            textTransform="uppercase"
          >
            {item.category}
          </Text>
          <Text fontSize={12} color="$color" flex={1} fontFamily="$mono">
            {item.message}
          </Text>
        </XStack>
      );
    },
    [selectedIds, isDark, toggleSelection],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Debug Logs',
          headerRight: () => (
            <XStack gap="$3" marginRight="$2">
              <FontAwesome
                name="copy"
                size={18}
                color={isDark ? '#ccc' : '#333'}
                onPress={selectedIds.size > 0 ? handleCopySelected : handleCopyAll}
              />
              <FontAwesome
                name="trash"
                size={18}
                color="#EF4444"
                onPress={handleClear}
              />
            </XStack>
          ),
        }}
      />
      <YStack flex={1} backgroundColor="$background">
        {selectedIds.size > 0 && (
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            backgroundColor={isDark ? '$gray3' : '$gray2'}
            justifyContent="space-between"
            alignItems="center"
          >
            <Text fontSize={12} color="$gray10">
              {selectedIds.size} selected
            </Text>
            <XStack gap="$3">
              <Button size="$2" onPress={handleCopySelected}>
                Copy Selected
              </Button>
              <Button size="$2" chromeless onPress={() => setSelectedIds(new Set())}>
                Deselect
              </Button>
            </XStack>
          </XStack>
        )}
        {logs.length === 0 ? (
          <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
            <FontAwesome name="file-text-o" size={48} color={isDark ? '#555' : '#ccc'} />
            <Text color="$gray10" marginTop="$3">
              No logs yet. Enable debug logging in Settings.
            </Text>
          </YStack>
        ) : (
          <FlatList
            data={logs}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            inverted={false}
            contentContainerStyle={{ paddingVertical: 8 }}
          />
        )}
      </YStack>
    </>
  );
}
