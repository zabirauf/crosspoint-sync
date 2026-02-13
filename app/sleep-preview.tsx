import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
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
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { processAndQueueSleepBackground } from '@/services/sleep-background';
import { SLEEP_SCREEN_WIDTH, SLEEP_SCREEN_HEIGHT } from '@/constants/Protocol';

const ASPECT_RATIO = SLEEP_SCREEN_WIDTH / SLEEP_SCREEN_HEIGHT; // 0.6 (3:5)
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const FRAME_PADDING = 32;

export default function SleepPreviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Calculate the crop frame dimensions (fixed 3:5 aspect ratio)
  const frame = useMemo(() => {
    const availableH = screenH - 180; // room for top/bottom bars
    const availableW = screenW - FRAME_PADDING * 2;
    let frameH = availableH;
    let frameW = frameH * ASPECT_RATIO;
    if (frameW > availableW) {
      frameW = availableW;
      frameH = frameW / ASPECT_RATIO;
    }
    return { width: frameW, height: frameH };
  }, [screenW, screenH]);

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
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Clamp pan so image always covers the frame
  const clampPan = useCallback(
    (tx: number, ty: number, currentScale: number) => {
      'worklet';
      if (!imageSize) return { x: tx, y: ty };

      const displayScale = fitScale * currentScale;
      const imgDisplayW = imageSize.width * displayScale;
      const imgDisplayH = imageSize.height * displayScale;

      const maxPanX = Math.max(0, (imgDisplayW - frame.width) / 2);
      const maxPanY = Math.max(0, (imgDisplayH - frame.height) / 2);

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
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Pan gesture
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const rawX = savedTranslateX.value + e.translationX;
      const rawY = savedTranslateY.value + e.translationY;
      const clamped = clampPan(rawX, rawY, scale.value);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
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
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  // Handle confirm: calculate crop region in original image coordinates
  const handleConfirm = useCallback(async () => {
    if (!imageSize) return;

    setProcessing(true);
    try {
      const currentScale = scale.value;
      const currentTX = translateX.value;
      const currentTY = translateY.value;
      const displayScale = fitScale * currentScale;

      // Convert frame bounds to original image coordinates
      const cropWidth = frame.width / displayScale;
      const cropHeight = frame.height / displayScale;
      const cropOriginX = imageSize.width / 2 - currentTX / displayScale - cropWidth / 2;
      const cropOriginY = imageSize.height / 2 - currentTY / displayScale - cropHeight / 2;

      await processAndQueueSleepBackground(imageUri!, {
        originX: cropOriginX,
        originY: cropOriginY,
        width: cropWidth,
        height: cropHeight,
      });

      router.back();
    } catch (err) {
      Alert.alert('Error', `Failed to process image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [imageSize, fitScale, frame, imageUri, scale, translateX, translateY]);

  if (!imageUri) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <Text>No image selected</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="#000">
      <StatusBar style="light" />

      {/* Top bar */}
      <XStack
        paddingTop="$8"
        paddingBottom="$3"
        paddingHorizontal="$4"
        justifyContent="space-between"
        alignItems="center"
        backgroundColor="rgba(0,0,0,0.8)"
        zIndex={10}
      >
        <Button
          size="$3"
          chromeless
          color="#fff"
          onPress={() => router.back()}
          disabled={processing}
        >
          Cancel
        </Button>
        <YStack alignItems="center">
          <Text color="#fff" fontSize="$4" fontWeight="600">Sleep Background</Text>
          <Text color="$gray8" fontSize="$2">480 x 800 &middot; Grayscale</Text>
        </YStack>
        <Button
          size="$3"
          chromeless
          color={processing ? '$gray8' : '#81d4fa'}
          onPress={handleConfirm}
          disabled={processing}
        >
          {processing ? 'Processing...' : 'Done'}
        </Button>
      </XStack>

      {/* Crop area */}
      {imageSize ? (
        <View style={styles.cropContainer}>
          {/* Image layer (behind the overlay) */}
          <View style={[styles.imageContainer, { width: frame.width, height: frame.height }]}>
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
        </View>
      ) : (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator color="#fff" size="large" />
        </YStack>
      )}

      {/* Bottom bar */}
      <XStack
        paddingVertical="$3"
        paddingHorizontal="$4"
        justifyContent="center"
        alignItems="center"
        backgroundColor="rgba(0,0,0,0.8)"
        zIndex={10}
      >
        <Text color="$gray8" fontSize="$2" textAlign="center">
          Pinch to zoom &middot; Drag to position
        </Text>
      </XStack>

      {/* Processing overlay */}
      {processing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text color="#fff" marginTop="$3" fontSize="$3">Converting to BMP...</Text>
        </View>
      )}
    </YStack>
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
