import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import 'react-native-reanimated';

import tamaguiConfig from '../tamagui.config';
import { startQueueProcessor } from '@/services/upload-queue';
import { useDeviceStatusPolling } from '@/hooks/use-device-status';
import { useDeviceStore } from '@/stores/device-store';
import { validateDeviceIP } from '@/services/device-discovery';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  // Start upload queue processor
  useEffect(() => {
    const unsubscribe = startQueueProcessor();
    return unsubscribe;
  }, []);

  // Auto-reconnect to last known device on app launch
  useEffect(() => {
    const tryReconnect = async () => {
      const { connectionStatus, lastDeviceIp } = useDeviceStore.getState();
      if (connectionStatus === 'disconnected' && lastDeviceIp) {
        const { setConnectionStatus, connectDevice } = useDeviceStore.getState();
        setConnectionStatus('connecting');
        try {
          const device = await validateDeviceIP(lastDeviceIp);
          if (device) {
            connectDevice(device);
          } else {
            setConnectionStatus('disconnected');
          }
        } catch {
          setConnectionStatus('disconnected');
        }
      }
    };

    if (useDeviceStore.persist.hasHydrated()) {
      tryReconnect();
    }
    const unsub = useDeviceStore.persist.onFinishHydration(() => {
      tryReconnect();
    });
    return unsub;
  }, []);

  // Poll device status while connected
  useDeviceStatusPolling();

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme ?? 'light'}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="debug-logs" options={{ title: 'Debug Logs' }} />
        </Stack>
      </ThemeProvider>
    </TamaguiProvider>
  );
}
