import { useState, useCallback } from 'react';
import { Pressable, StyleSheet, useColorScheme } from 'react-native';
import { YStack, XStack, Text } from 'tamagui';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AddBookFABProps {
  onAddBook: () => void;
  onNewFolder: () => void;
  bottomOffset?: number;
}

export function AddBookFAB({ onAddBook, onNewFolder, bottomOffset = 16 }: AddBookFABProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  const openMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuOpen(true);
    opacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) });
    translateY.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.ease) });
  }, [opacity, translateY]);

  const closeMenu = useCallback(() => {
    opacity.value = withTiming(0, { duration: 120 });
    translateY.value = withTiming(8, { duration: 120 });
    setTimeout(() => setMenuOpen(false), 120);
  }, [opacity, translateY]);

  const handleOption = useCallback((action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeMenu();
    // Small delay so menu animates out before action (e.g. Alert.prompt) fires
    setTimeout(action, 150);
  }, [closeMenu]);

  const animatedMenuStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <>
      {/* Backdrop to close menu when tapping outside */}
      {menuOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      )}

      {/* Floating menu */}
      {menuOpen && (
        <Animated.View
          style={[
            styles.menu,
            { bottom: bottomOffset + 64, backgroundColor: isDark ? '#2a2a2a' : '#fff' },
            animatedMenuStyle,
          ]}
        >
          <Pressable
            onPress={() => handleOption(onAddBook)}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <XStack gap="$2.5" alignItems="center" paddingHorizontal="$3" paddingVertical="$2.5">
              <FontAwesome name="book" size={16} color={isDark ? '#81d4fa' : '#1a73e8'} />
              <Text fontSize="$3" fontWeight="500">Upload Book</Text>
            </XStack>
          </Pressable>
          <YStack height={0.5} backgroundColor={isDark ? '$gray6' : '$gray4'} />
          <Pressable
            onPress={() => handleOption(onNewFolder)}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <XStack gap="$2.5" alignItems="center" paddingHorizontal="$3" paddingVertical="$2.5">
              <FontAwesome name="folder" size={16} color={isDark ? '#ffb74d' : '#f5a623'} />
              <Text fontSize="$3" fontWeight="500">New Folder</Text>
            </XStack>
          </Pressable>
        </Animated.View>
      )}

      {/* FAB */}
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onAddBook(); }}
        onLongPress={openMenu}
        style={[styles.fab, { bottom: bottomOffset }]}
      >
        <FontAwesome name="plus" size={22} color="#fff" />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  menu: {
    position: 'absolute',
    right: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 11,
    minWidth: 170,
    overflow: 'hidden',
  },
  menuItem: {
    borderRadius: 0,
  },
  menuItemPressed: {
    opacity: 0.6,
  },
});
