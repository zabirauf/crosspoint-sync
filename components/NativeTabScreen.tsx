import type { ComponentType } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@react-navigation/native';
import { View } from 'react-native';

const Stack = createNativeStackNavigator();

// Each native tab needs its own navigation container so UIKit can place its
// navigation items alongside the tabs, including Duo's vertical system rail.
export function NativeTabScreen({ name, component }: { name: string; component: ComponentType }) {
  const { colors } = useTheme();

  return (
    // The native tab's default white backdrop is exposed above Duo's outer
    // navigation bar. Cover the entire tab with the current header surface.
    <View testID={`NativeTab.${name}`} style={{ flex: 1, backgroundColor: colors.card }}>
      <Stack.Navigator>
        <Stack.Screen name={name} component={component} options={{ title: name }} />
      </Stack.Navigator>
    </View>
  );
}
