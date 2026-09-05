import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, MapPin } from 'lucide-react-native';
import { Glass, Pressy, Small, Text, Title } from '../ui';
import { colors, fonts, radius } from '../theme';
import { greeting } from '../lib/dates';

/** @param {{ name?: string|null, address?: any }} props */
export function HomeHeader({ name, address }) {
  const router = useRouter();
  const first = (name || '').split(' ')[0];
  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Small muted>{greeting()} ☀️</Small>
        <Title style={{ marginTop: 2 }}>{first ? `Hello, ${first}` : 'Hello there'}</Title>
        <Pressy
          onPress={() => router.push('/profile')}
          haptics="select"
          style={styles.addr}
          accessibilityLabel="Your account, addresses and details"
        >
          <MapPin size={13} color={colors.leaf} strokeWidth={2.4} />
          <Text
            variant="small"
            color={colors.leafDeep}
            numberOfLines={1}
            style={{ fontFamily: fonts.bodyMedium }}
          >
            {address
              ? `${address.block} · ${address.flat}, ${address.communityName}`
              : 'Add a delivery address'}
          </Text>
          <ChevronRight size={13} color={colors.leaf} />
        </Pressy>
      </View>
      <Pressy
        onPress={() => router.push('/orders')}
        haptics="select"
        accessibilityLabel="Notifications"
      >
        <Glass radius={radius.pill} innerStyle={styles.bell}>
          <Bell size={20} color={colors.ink} strokeWidth={2.1} />
          <View style={styles.dot} />
        </Glass>
      </Pressy>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  addr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  bell: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tomato,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
});
