import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { TabBar } from '../../src/components/TabBar';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
        lazy: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="plan" options={{ title: 'Dietitian' }} />
      <Tabs.Screen
        name="bag"
        options={{ title: 'Basket' }}
        listeners={{
          tabPress: (/** @type {any} */ e) => {
            e.preventDefault();
            router.push('/cart');
          },
        }}
      />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
    </Tabs>
  );
}
