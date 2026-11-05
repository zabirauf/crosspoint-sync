import { type ReactNode, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';

const SHEET_MAX_WIDTH = 560;
const DEFAULT_SHEET_HEIGHT = 640;
const SHEET_VIEWPORT_CLEARANCE = 24;
const KEYBOARD_VERTICAL_PADDING = 8;

interface AdaptiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testID: string;
  children: ReactNode;
  height?: number;
  padding?: number;
}

function SheetSurface({ onOpenChange, testID, children, height = DEFAULT_SHEET_HEIGHT, padding = 16 }: AdaptiveSheetProps) {
  const { expanded, height: windowHeight, insets } = useAdaptiveLayout();
  const isDark = useColorScheme() === 'dark';
  const [androidKeyboard, setAndroidKeyboard] = useState(
    () => Platform.OS === 'android' ? Keyboard.metrics() : undefined,
  );
  const androidKeyboardDocked = androidKeyboard !== undefined && androidKeyboard.height > 0 &&
    androidKeyboard.screenY + androidKeyboard.height >= windowHeight - insets.bottom;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => setAndroidKeyboard(event.endCoordinates));
    const hide = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboard(undefined));
    return () => { show.remove(); hide.remove(); };
  }, []);
  // Edge-to-edge Android modals do not resize their content above the IME.
  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding">
      <Pressable
        style={styles.backdrop}
        onPress={() => onOpenChange(false)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss dialog"
        testID={`${testID}.Backdrop`}
      />
      {/* A docked Android IME already covers the bottom navigation safe area. */}
      <SafeAreaView
        pointerEvents="box-none"
        edges={androidKeyboardDocked ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
        style={[styles.fill, { justifyContent: expanded ? 'center' : 'flex-end' }]}
      >
        <View
          accessibilityViewIsModal
          testID={testID}
          style={[
            styles.surface,
            {
              backgroundColor: isDark ? '#151515' : '#fff',
              width: expanded ? SHEET_MAX_WIDTH : '100%',
              maxWidth: '100%',
              height: Math.min(height, Math.max(0, windowHeight - insets.top - insets.bottom - SHEET_VIEWPORT_CLEARANCE)),
              flexShrink: 1,
              paddingHorizontal: padding,
              paddingVertical: androidKeyboardDocked ? Math.min(padding, KEYBOARD_VERTICAL_PADDING) : padding,
              borderRadius: expanded ? 24 : 20,
            },
          ]}
        >
          {children}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// Keep the same native presentation and child tree while the window resizes.
// Switching between Sheet and Dialog at a breakpoint would discard input focus.
export function AdaptiveSheet(props: AdaptiveSheetProps) {
  return (
    <Modal
      visible={props.open}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']}
      onRequestClose={() => props.onOpenChange(false)}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider>
        <SheetSurface {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  surface: { alignSelf: 'center', overflow: 'hidden' },
});
