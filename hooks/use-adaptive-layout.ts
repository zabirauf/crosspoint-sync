import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isExpandedWidth } from '@/constants/Layout';

export function useAdaptiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  return {
    width, height, fontScale, insets, usableWidth,
    expanded: isExpandedWidth(usableWidth, fontScale),
  };
}
