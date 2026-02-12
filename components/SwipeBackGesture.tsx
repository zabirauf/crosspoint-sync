import { type ReactNode, useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { FontAwesome } from '@expo/vector-icons';

const EDGE_ZONE = 25;
const COMMIT_FRACTION = 0.35;
const COMMIT_VELOCITY = 500;

interface SwipeBackGestureProps {
  onSwipeBack: () => void;
  enabled: boolean;
  resetKey: string;
  children: ReactNode;
}

export function SwipeBackGesture({
  onSwipeBack,
  enabled,
  resetKey,
  children,
}: SwipeBackGestureProps) {
  const translateX = useSharedValue(0);
  const startedInEdge = useSharedValue(false);
  const { width: screenWidth } = useWindowDimensions();

  // Reset position instantly when path changes (new folder content appears in place)
  useEffect(() => {
    translateX.value = 0;
  }, [resetKey]);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(15)
    .failOffsetX(-15)
    .failOffsetY([-20, 20])
    .onBegin((e) => {
      startedInEdge.value = e.x <= EDGE_ZONE;
    })
    .onStart(() => {
      if (!startedInEdge.value) {
        // Cancel by not tracking
        translateX.value = 0;
      }
    })
    .onUpdate((e) => {
      if (startedInEdge.value) {
        translateX.value = Math.max(0, e.translationX);
      }
    })
    .onEnd((e) => {
      if (!startedInEdge.value) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        return;
      }
      const pastThreshold =
        translateX.value > screenWidth * COMMIT_FRACTION ||
        e.velocityX > COMMIT_VELOCITY;
      if (pastThreshold) {
        translateX.value = withSpring(screenWidth, { damping: 20, stiffness: 200 });
        runOnJS(onSwipeBack)();
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const chevronOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, 60],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.container, contentStyle]}>
        <Animated.View style={[styles.chevron, chevronOpacity]}>
          <FontAwesome name="chevron-left" size={18} color="#999" />
        </Animated.View>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chevron: {
    position: 'absolute',
    left: -28,
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});
