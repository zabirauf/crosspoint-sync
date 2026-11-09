import type { ComponentType } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

// Each native tab needs its own navigation container so UIKit can place its
// navigation items alongside the tabs, including Duo's vertical system rail.
export function NativeTabScreen({ name, component }: { name: string; component: ComponentType }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name={name} component={component} options={{ title: name }} />
    </Stack.Navigator>
  );
}
