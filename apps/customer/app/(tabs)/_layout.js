import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { TabBar } from '../../src/components/TabBar';
import { colors } from '../../src/theme';
import { selectAiVisible } from '../../src/features/role/roleSlice';

export default function TabsLayout() {
  const router = useRouter();
  // The AI planner (Dietitian) is gated: only staff numbers granted AI access — and super admin —
  // see it. Normal customers don't. Managed on the admin "Access & roles" page.
  const aiVisible = useSelector(selectAiVisible);
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
        lazy: true,
        // Freeze inactive tabs so backgrounded screens do no render/animation work — keeps the app
        // responsive no matter how much you navigate between tabs.
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen
        name="plan"
        options={{ title: 'Dietitian', href: aiVisible ? undefined : null }}
      />
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
