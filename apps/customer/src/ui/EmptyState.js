import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Glass } from './Glass';
import { Body, Title } from './Text';
import { Button } from './Button';
import { colors } from '../theme';

/**
 * @param {{ icon?: any, title: string, message?: string, action?: { title: string, onPress: () => void }, style?: any }} props
 */
export function EmptyState({ icon, title, message, action, style }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(360).springify().damping(18)}
      style={[styles.wrap, style]}
    >
      {icon ? (
        <Glass radius={999} elevated style={styles.iconWrap} innerStyle={styles.iconInner}>
          {icon}
        </Glass>
      ) : null}
      <Title center style={{ marginTop: 18 }}>
        {title}
      </Title>
      {message ? (
        <Body center muted style={{ marginTop: 8, maxWidth: 280 }}>
          {message}
        </Body>
      ) : null}
      {action ? (
        <View style={{ marginTop: 20 }}>
          <Button
            title={action.title}
            onPress={action.onPress}
            size="md"
            full={false}
            variant="primary"
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  iconWrap: { width: 76, height: 76 },
  iconInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
});
