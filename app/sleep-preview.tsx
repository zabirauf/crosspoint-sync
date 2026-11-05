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
import { SLEEP_SCREEN_WIDTH, SLEEP_SCREEN_HEIGHT } from '@/constants/Protocol';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { fitCropFrame, getSourceCrop } from '@/utils/crop-geometry';

const ASPECT_RATIO = SLEEP_SCREEN_WIDTH / SLEEP_SCREEN_HEIGHT; // 0.6 (3:5)
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export default function SleepPreviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Calculate the crop frame dimensions (fixed 3:5 aspect ratio)
  const frame = useMemo(() => fitCropFrame(canvas, ASPECT_RATIO), [canvas]);

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
    if (!imageSize) return;

    setProcessing(true);
    try {
      await processAndQueueSleepBackground(imageUri!, getSourceCrop(imageSize, frame, scale.value, {
        x: translateX.value, y: translateY.value,
      }));

      router.back();
    } catch (err) {
      Alert.alert('Error', `Failed to process image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [imageSize, frame, imageUri, scale, translateX, translateY]);

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
          <Text testID="SleepPreview.OutputFormat" color="$gray8" fontSize="$2">480 x 800 &middot; Grayscale output</Text>
        </YStack>
        <Button
          size="$3"
          minHeight={44}
          testID="SleepPreview.Done"
          chromeless
          color={processing ? '$gray8' : '#81d4fa'}
          onPress={handleConfirm}
          disabled={processing || !imageSize || !canvas.width || !canvas.height}
        >
          {processing ? 'Processing...' : 'Done'}
        </Button>
      </XStack>

      {/* Crop area */}
      <View style={styles.cropContainer} testID="SleepPreview.Canvas" onLayout={(event) => setCanvas(event.nativeEvent.layout)}>
        {imageSize ? (
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
        ) : (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <ActivityIndicator color="#fff" size="large" />
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
