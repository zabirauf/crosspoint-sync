import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { TamaguiProvider, PortalProvider } from 'tamagui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import tamaguiConfig from '../tamagui.config';
import { startQueueProcessor, pauseCurrentUploadJob } from '@/services/upload-queue';
import { useUploadStore } from '@/stores/upload-store';
import { useDeviceStatusPolling } from '@/hooks/use-device-status';
import { useDeviceStore } from '@/stores/device-store';
import { validateDeviceIP } from '@/services/device-discovery';
import { importSharedFiles } from '@/services/share-import';
import { importClippedArticles } from '@/services/clip-import';
import {
  importAndroidSharedFiles,
  subscribeToAndroidShareIntent,
} from '@/services/android-share-import';

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

  // Keep screen awake during uploads
  useEffect(() => {
    const unsubscribe = useUploadStore.subscribe((state) => {
      const hasActive = state.jobs.some(
        (j) => j.status === 'uploading' || j.status === 'pending'
      );
      if (hasActive) {
        activateKeepAwakeAsync('upload');
      } else {
        deactivateKeepAwake('upload');
      }
    });
    // Check initial state
    const { jobs } = useUploadStore.getState();
    if (jobs.some((j) => j.status === 'uploading' || j.status === 'pending')) {
      activateKeepAwakeAsync('upload');
    }
    return () => {
      unsubscribe();
      deactivateKeepAwake('upload');
    };
  }, []);

  // Pause active upload when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') {
        pauseCurrentUploadJob();
      }
    });
    return () => sub.remove();
  }, []);

  // Import files shared via iOS Share Extension, Safari Web Clipper, or Android Share Intent
  useEffect(() => {
    const importAll = () => {
      importSharedFiles();
      importClippedArticles();
      importAndroidSharedFiles();
    };

    // Import on launch (after store hydration)
    if (useUploadStore.persist.hasHydrated()) {
      importAll();
    }
    const unsub = useUploadStore.persist.onFinishHydration(() => {
      importAll();
    });

    // Import when app returns to foreground
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        importAll();
      }
    });

    // Subscribe to Android share intent events (new intents while app is running)
    const unsubShareIntent = subscribeToAndroidShareIntent();

    return () => {
      unsub();
      sub.remove();
      unsubShareIntent();
    };
  }, []);

  // Poll device status while connected
  useDeviceStatusPolling();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme ?? 'light'}>
        <PortalProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              <Stack.Screen name="debug-logs" options={{ title: 'Debug Logs' }} />
              <Stack.Screen
                name="sleep-preview"
                options={{
                  presentation: 'fullScreenModal',
                  headerShown: false,
                  animation: 'slide_from_bottom',
                }}
              />
            </Stack>
          </ThemeProvider>
        </PortalProvider>
      </TamaguiProvider>
    </GestureHandlerRootView>
  );
}
