import { useState } from 'react';
import { ScrollView, useColorScheme, Alert, ActivityIndicator } from 'react-native';
import { YStack, XStack, Text, Button, Separator, useTheme, Spinner } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useRssStore } from '@/stores/rss-store';
import { useSettingsStore } from '@/stores/settings-store';
import { subscribeToFeed, checkAllFeeds, checkFeed, destinationForFeed } from '@/services/rss-fetch';
import { PromptDialog } from '@/components/PromptDialog';
import { EmptyState } from '@/components/EmptyState';
import { RssFeed } from '@/types/rss';

function formatLastChecked(feed: RssFeed): string {
  if (feed.lastError) return `Error: ${feed.lastError}`;
  if (!feed.lastCheckedAt) return 'Never checked';
  const minutes = Math.floor((Date.now() - feed.lastCheckedAt) / 60000);
  if (minutes < 1) return 'Checked just now';
  if (minutes < 60) return `Checked ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Checked ${hours}h ago`;
  return `Checked ${Math.floor(hours / 24)}d ago`;
}

function FeedRow({
  feed,
  onEditKeywords,
  onEditFolder,
  onRemove,
  onCheck,
}: {
  feed: RssFeed;
  onEditKeywords: () => void;
  onEditFolder: () => void;
  onRemove: () => void;
  onCheck: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const setFeedEnabled = useRssStore((s) => s.setFeedEnabled);
  const isChecking = useRssStore((s) => s.checkingFeedIds.includes(feed.id));

  return (
    <YStack gap="$2" paddingVertical="$3" testID={`RssFeeds.Feed.${feed.id}`}>
      <XStack justifyContent="space-between" alignItems="center" gap="$3">
        <XStack gap="$3" alignItems="center" flex={1}>
          {/* Padded wrapper so the toggle has a finger-sized tap target, not just the glyph. */}
          <XStack
            padding="$2"
            marginLeft="$-2"
            onPress={() => setFeedEnabled(feed.id, !feed.enabled)}
            pressStyle={{ opacity: 0.7 }}
            testID={`RssFeeds.Toggle.${feed.id}`}
          >
            <FontAwesome
              name={feed.enabled ? 'toggle-on' : 'toggle-off'}
              size={22}
              color={feed.enabled ? '#22C55E' : isDark ? '#555' : '#ccc'}
            />
          </XStack>
          <YStack flex={1}>
            <Text fontSize="$4" numberOfLines={1}>
              {feed.title}
            </Text>
            <Text fontSize="$2" color={feed.lastError ? '$red10' : '$gray10'} numberOfLines={1}>
              {formatLastChecked(feed)}
            </Text>
          </YStack>
        </XStack>
        {isChecking ? (
          <Spinner size="small" />
        ) : (
          <XStack
            padding="$2"
            onPress={onCheck}
            pressStyle={{ opacity: 0.7 }}
            testID={`RssFeeds.CheckFeed.${feed.id}`}
          >
            <FontAwesome name="refresh" size={16} color={isDark ? '#aaa' : '#666'} />
          </XStack>
        )}
      </XStack>

      <XStack gap="$2" alignItems="center" paddingLeft="$8" flexWrap="wrap">
        <Button size="$2" chromeless onPress={onEditKeywords} testID={`RssFeeds.Keywords.${feed.id}`}>
          <Text fontSize="$2" color="$blue10">
            {feed.keywords.length > 0 ? `Keywords: ${feed.keywords.join(', ')}` : 'Add keyword filter'}
          </Text>
        </Button>
        <Button size="$2" chromeless onPress={onEditFolder} testID={`RssFeeds.Folder.${feed.id}`}>
          <Text fontSize="$2" color="$blue10">
            {destinationForFeed(feed)}
          </Text>
        </Button>
        <Button size="$2" chromeless onPress={onRemove} testID={`RssFeeds.Remove.${feed.id}`}>
          <Text fontSize="$2" color="$red10">
            Remove
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
}

export default function RssFeedsScreen() {
  const theme = useTheme();
  const feeds = useRssStore((s) => s.feeds);
  const removeFeed = useRssStore((s) => s.removeFeed);
  const setFeedKeywords = useRssStore((s) => s.setFeedKeywords);
  const setFeedFolder = useRssStore((s) => s.setFeedFolder);
  const rssUploadPath = useSettingsStore((s) => s.rssUploadPath);

  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [keywordFeedId, setKeywordFeedId] = useState<string | null>(null);
  const [folderFeedId, setFolderFeedId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);

  const keywordFeed = feeds.find((f) => f.id === keywordFeedId);
  const folderFeed = feeds.find((f) => f.id === folderFeedId);

  const handleAddFeed = async (url: string) => {
    if (!url.trim()) return;
    setAdding(true);
    try {
      const feed = await subscribeToFeed(url);
      Alert.alert(
        'Feed added',
        `Subscribed to "${feed.title}". Check now to queue its latest articles.`,
      );
    } catch (e) {
      Alert.alert('Could not add feed', e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (feed: RssFeed) => {
    Alert.alert('Remove Feed', `Stop following "${feed.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFeed(feed.id) },
    ]);
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    try {
      const queued = await checkAllFeeds();
      Alert.alert(
        'Check complete',
        queued > 0
          ? `Queued ${queued} article${queued === 1 ? '' : 's'} for upload.`
          : 'No new articles matched your feeds.',
      );
    } finally {
      setCheckingAll(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'RSS Feeds' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background.val }}
        // flexGrow lets the empty state's flex:1 actually fill and centre the screen.
        contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1 }}
        testID="RssFeeds.Screen"
      >
        <XStack gap="$3">
          <Button
            flex={1}
            size="$3"
            theme="blue"
            disabled={adding}
            onPress={() => setAddOpen(true)}
            testID="RssFeeds.AddFeed"
          >
            {adding ? <ActivityIndicator color="#fff" /> : 'Add Feed'}
          </Button>
          <Button
            flex={1}
            size="$3"
            disabled={checkingAll || feeds.length === 0}
            onPress={handleCheckAll}
            testID="RssFeeds.CheckNow"
          >
            {checkingAll ? <ActivityIndicator /> : 'Check Now'}
          </Button>
        </XStack>

        {feeds.length === 0 ? (
          <EmptyState
            icon="rss"
            title="No feeds yet"
            subtitle="Add an RSS or Atom feed URL. New articles are converted to EPUB and queued for your device automatically."
          />
        ) : (
          <YStack testID="RssFeeds.List">
            {feeds.map((feed, index) => (
              <YStack key={feed.id}>
                {index > 0 && <Separator />}
                <FeedRow
                  feed={feed}
                  onCheck={() => checkFeed(feed.id)}
                  onEditKeywords={() => setKeywordFeedId(feed.id)}
                  onEditFolder={() => setFolderFeedId(feed.id)}
                  onRemove={() => handleRemove(feed)}
                />
              </YStack>
            ))}
          </YStack>
        )}

        <Text fontSize="$2" color="$gray10" paddingHorizontal="$2">
          Feeds are checked when you tap Check Now. Articles matching a feed&apos;s keywords are
          fetched, converted to EPUB, and added to the upload queue — they transfer next time your
          device connects.
        </Text>
      </ScrollView>

      <PromptDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Feed"
        message="Enter an RSS or Atom feed URL"
        placeholder="https://example.com/feed.xml"
        submitLabel="Add"
        onSubmit={handleAddFeed}
      />

      <PromptDialog
        open={keywordFeed !== undefined}
        onOpenChange={(open) => !open && setKeywordFeedId(null)}
        title="Keyword Filter"
        message="Comma-separated keywords. An article is queued if any keyword appears in its title or summary. Leave empty to queue everything new."
        defaultValue={keywordFeed?.keywords.join(', ') ?? ''}
        onSubmit={(value) => {
          if (!keywordFeedId) return;
          const keywords = value
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0);
          setFeedKeywords(keywordFeedId, keywords);
        }}
      />

      <PromptDialog
        open={folderFeed !== undefined}
        onOpenChange={(open) => !open && setFolderFeedId(null)}
        title="Feed Folder"
        message={`Subfolder for this feed's articles, beneath ${rssUploadPath}. Leave empty to save them directly there. Letters, numbers and dashes only.`}
        defaultValue={folderFeed?.folderName ?? ''}
        onSubmit={(value) => {
          if (!folderFeedId) return;
          setFeedFolder(folderFeedId, value);
        }}
      />
    </>
  );
}
