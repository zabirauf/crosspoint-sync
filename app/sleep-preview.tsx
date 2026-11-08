import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Image,
  ActivityIndicator,
  View,
  Alert,
} from 'react-native';
import { YStack, XStack, Text, Button } from 'tamagui';
import { router, useLocalSearchParams } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { processAndQueueSleepBackground } from '@/services/sleep-background';
import { getReaderProfile } from '@/constants/ReaderProfiles';
import { useDeviceStore } from '@/stores/device-store';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { fitCropFrame, getSourceCrop } from '@/utils/crop-geometry';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export default function SleepPreviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const deviceStatus = useDeviceStore((state) => state.deviceStatus);
  // No status is different from a legacy response that omits the model field.
  // Once chosen, keep preview and output identical even if the reader changes.
  const [profile, setProfile] = useState(() => deviceStatus ? getReaderProfile(deviceStatus.device) : null);
  useEffect(() => {
    if (deviceStatus) setProfile((selected) => selected ?? getReaderProfile(deviceStatus.device));
  }, [deviceStatus]);
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  const frame = useMemo(() => fitCropFrame(canvas, profile ? profile.width / profile.height : 1), [canvas, profile]);

  // Load image dimensions
  useEffect(() => {
    if (imageUri) {
      Image.getSize(
        imageUri,
        (w, h) => setImageSize({ width: w, height: h }),
        () => Alert.alert('Error', 'Failed to load image'),
      );
    }
  }, [imageUri]);

  // Calculate the initial scale so the image fills the crop frame
  const fitScale = useMemo(() => {
    if (!imageSize) return 1;
    const scaleW = frame.width / imageSize.width;
    const scaleH = frame.height / imageSize.height;
    return Math.max(scaleW, scaleH); // fill (cover) the frame
  }, [imageSize, frame]);

  // Gesture shared values
  const scale = useSharedValue(MIN_ZOOM);
  const savedScale = useSharedValue(MIN_ZOOM);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    scale.value = MIN_ZOOM;
    savedScale.value = MIN_ZOOM;
    translateX.value = 0;
    translateY.value = 0;
  }, [profile, scale, savedScale, translateX, translateY]);

  // Clamp pan so image always covers the frame
  const clampPan = useCallback(
    (tx: number, ty: number, currentScale: number) => {
      'worklet';
      if (!imageSize) return { x: tx, y: ty };

      const displayScale = fitScale * currentScale;
      const imgDisplayW = imageSize.width * displayScale;
      const imgDisplayH = imageSize.height * displayScale;

      const maxPanX = Math.max(0, (imgDisplayW / frame.width - 1) / 2);
      const maxPanY = Math.max(0, (imgDisplayH / frame.height - 1) / 2);

      return {
        x: Math.min(maxPanX, Math.max(-maxPanX, tx)),
        y: Math.min(maxPanY, Math.max(-maxPanY, ty)),
      };
    },
    [imageSize, fitScale, frame],
  );

  // Pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, savedScale.value * e.scale));
      scale.value = newScale;
      // Re-clamp pan at new scale
      const clamped = clampPan(translateX.value, translateY.value, newScale);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  // Pan gesture
  const panGesture = Gesture.Pan()
    .onChange((e) => {
      const rawX = translateX.value + e.changeX / frame.width;
      const rawY = translateY.value + e.changeY / frame.height;
      const clamped = clampPan(rawX, rawY, scale.value);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Animated style for the image
  const animatedImageStyle = useAnimatedStyle(() => {
    if (!imageSize) return {};
    const displayScale = fitScale * scale.value;
    return {
      width: imageSize.width * displayScale,
      height: imageSize.height * displayScale,
      transform: [
        { translateX: translateX.value * frame.width },
        { translateY: translateY.value * frame.height },
      ],
    };
  });

  // Handle confirm: calculate crop region in original image coordinates
  const handleConfirm = useCallback(async () => {
    if (!imageSize || !profile) return;

    setProcessing(true);
    try {
      await processAndQueueSleepBackground(imageUri!, getSourceCrop(imageSize, frame, scale.value, {
        x: translateX.value, y: translateY.value,
      }), profile);

      router.back();
    } catch (err) {
      Alert.alert('Error', `Failed to process image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [imageSize, frame, imageUri, scale, translateX, translateY, profile]);

  if (!imageUri) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <Text>No image selected</Text>
      </YStack>
    );
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom', 'left', 'right']} testID="SleepPreview.Screen">
      <StatusBar style="light" />

      {/* Top bar */}
      <XStack
        paddingTop="$3"
        paddingBottom="$3"
        paddingHorizontal="$4"
        justifyContent="space-between"
        alignItems="center"
        backgroundColor="rgba(0,0,0,0.8)"
        zIndex={10}
      >
        <Button
          size="$3"
          minHeight={44}
          testID="SleepPreview.Cancel"
          chromeless
          color="#fff"
          onPress={() => router.back()}
          disabled={processing}
        >
          Cancel
        </Button>
        <YStack alignItems="center" flex={1} minWidth={0}>
          <Text color="#fff" fontSize="$4" fontWeight="600" textAlign="center">Sleep Background</Text>
          <Text testID="SleepPreview.OutputFormat" color="$gray8" fontSize="$2">{profile ? `${profile.width} x ${profile.height} · Grayscale output` : deviceStatus ? 'Unsupported reader display' : 'Choose a reader'}</Text>
        </YStack>
        <Button
          size="$3"
          minHeight={44}
          testID="SleepPreview.Done"
          chromeless
          color={processing ? '$gray8' : '#81d4fa'}
          onPress={handleConfirm}
          disabled={processing || !profile || !imageSize || !canvas.width || !canvas.height}
        >
          {processing ? 'Processing...' : 'Done'}
        </Button>
      </XStack>

      {!deviceStatus && (
        <YStack testID="SleepPreview.ReaderChoice" padding="$3" gap="$2" alignItems="center">
          <Text testID="SleepPreview.ReaderChoiceLabel" color="#fff" fontSize="$3">Reader for this image</Text>
          <XStack gap="$3">
            {(['X3', 'X4'] as const).map((model) => (
              <Button
                key={model}
                testID={`SleepPreview.Reader.${model}`}
                minHeight={44}
                disabled={processing}
                accessibilityState={{ selected: profile?.model === model }}
                backgroundColor={profile?.model === model ? '#27566b' : '#333'}
                color="#fff"
                onPress={() => setProfile(getReaderProfile(model))}
              >
                {model}
              </Button>
            ))}
          </XStack>
        </YStack>
      )}

      {/* Crop area */}
      <View style={styles.cropContainer} testID="SleepPreview.Canvas" onLayout={(event) => setCanvas(event.nativeEvent.layout)}>
        {imageSize && profile ? (
          <View testID="SleepPreview.CropFrame" style={[styles.imageContainer, { width: frame.width, height: frame.height }]}>
            <GestureDetector gesture={composedGesture}>
              <Animated.Image
                source={{ uri: imageUri }}
                style={[
                  {
                    position: 'absolute',
                    // @ts-ignore — RN 0.76+ CSS filter support
                    filter: [{ grayscale: 1 }, { contrast: 1.15 }],
                  },
                  animatedImageStyle,
                ]}
                resizeMode="cover"
              />
            </GestureDetector>
          </View>
        ) : !imageSize ? (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <ActivityIndicator color="#fff" size="large" />
          </YStack>
        ) : (
          <YStack testID="SleepPreview.NoReader" flex={1} alignItems="center" justifyContent="center" padding="$4">
            <Text color="#fff" textAlign="center">{deviceStatus ? 'This reader has no supported sleep-image profile.' : 'Choose X3 or X4, or connect your reader.'}</Text>
          </YStack>
        )}
      </View>

      {/* Bottom bar */}
      <XStack
        paddingVertical="$3"
        paddingHorizontal="$4"
        justifyContent="center"
        alignItems="center"
        backgroundColor="rgba(0,0,0,0.8)"
        zIndex={10}
      >
        <YStack alignItems="center" gap="$1">
          {profile && <Text testID="SleepPreview.TargetModel" color="#fff" fontSize="$2">Target: {profile.model}</Text>}
          <Text color="$gray8" fontSize="$2" textAlign="center">Pinch to zoom &middot; Drag to position</Text>
        </YStack>
      </XStack>

      {/* Processing overlay */}
      {processing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text color="#fff" marginTop="$3" fontSize="$3">Converting to BMP...</Text>
        </View>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  cropContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});
