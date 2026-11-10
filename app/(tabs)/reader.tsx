import { KeyboardAvoidingView } from 'react-native';
import { useTheme } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { ConnectionContent } from '@/components/ConnectionContent';
import { NativeTabScreen } from '@/components/NativeTabScreen';
import { ReaderToolbar, usesNativeReaderBars } from '@/modules/reader-toolbar';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { useDeviceStore } from '@/stores/device-store';

export default function ReaderRoute() {
  return usesNativeReaderBars ? <NativeTabScreen name="Reader" component={ReaderScreen} /> : <ReaderScreen />;
}

function ReaderScreen() {
  const connected = useDeviceStore((state) => state.connectionStatus === 'connected');
  const { expanded } = useAdaptiveLayout();
  const headerHeight = useHeaderHeight();
  const theme = useTheme();
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background.val }} testID="Reader.Screen">
      {usesNativeReaderBars && <ReaderToolbar enabled={false} connected={connected} needsAttention={false} onAction={() => {}} style={{ width: 0, height: 0 }} />}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
        <ConnectionContent contentContainerStyle={{ padding: expanded ? 24 : 16 }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
