import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import Colors from '@/constants/Colors';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { usesNativeReaderBars } from '@/modules/reader-toolbar';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { expanded, insets } = useAdaptiveLayout();

  if (usesNativeReaderBars) {
    return (
      <NativeTabs tintColor={Colors[colorScheme ?? 'light'].tint}>
        <NativeTabs.Trigger name="index" disablePopToTop disableScrollToTop>
          <Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} />
          <Label>Library</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="reader">
          <Icon src={require('@/assets/icons/reader.png')} />
          <Label>Reader</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Icon sf="gearshape" />
          <Label>Settings</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarPosition: expanded ? 'right' : 'bottom',
        tabBarVariant: expanded ? 'material' : 'uikit',
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          ...(expanded ? { width: 88 + insets.right, borderLeftWidth: 0.5 } : { borderTopWidth: 0.5 }),
          borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0',
        },
        tabBarItemStyle: expanded ? { minHeight: 64, marginVertical: 6 } : undefined,
        headerShown: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <TabBarIcon name="book" color={color} />,
          tabBarButtonTestID: 'TabBar.Library',
        }}
      />
      <Tabs.Screen
        name="reader"
        options={{ title: 'Reader', href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="gear" color={color} />,
          tabBarButtonTestID: 'TabBar.Settings',
        }}
      />
    </Tabs>
  );
}
