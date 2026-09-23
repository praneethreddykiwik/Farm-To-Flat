import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from './Text';
import { fonts, tintOf } from '../theme';
import { resolveStorageImage } from '../lib/supabase';

/**
 * Product photograph with a designed fallback. When the admin has not uploaded a photo yet
 * (or it fails to load) we render a botanical tile: category tint, a leaf mark and the initial.
 * Never a broken image, never a grey box.
 *
 * @param {{ uri?: string|null, blurhash?: string|null, tint?: string, name?: string, size?: number|'fill', radius?: number, style?: any, recyclingKey?: string, priority?: 'low'|'normal'|'high' }} props
 */
export function ProductImage({
  uri,
  blurhash,
  tint = 'mint',
  name = '',
  size = 'fill',
  radius = 20,
  style,
  recyclingKey,
  priority = 'normal',
}) {
  const [failed, setFailed] = useState(false);
  // Adjust on render when the source changes: a tile that failed once kept showing the fallback for
  // every later product that landed in the same recycled view.
  const [failedFor, setFailedFor] = useState(uri);
  if (failedFor !== uri) {
    setFailedFor(uri);
    setFailed(false);
  }
  const t = tintOf(tint);
  const dim = size === 'fill' ? { width: '100%', height: '100%' } : { width: size, height: size };
  // Absolute URLs pass through unchanged; a Supabase Storage path becomes a public URL.
  const src = resolveStorageImage(uri);

  if (!src || failed) {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    const fs = size === 'fill' ? 46 : Math.max(18, Math.round(size * 0.42));
    return (
      <View
        style={[dim, { borderRadius: radius, overflow: 'hidden', backgroundColor: t.bg }, style]}
      >
        <LinearGradient
          colors={[t.bg, t.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Svg
          style={StyleSheet.absoluteFill}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
        >
          <Circle cx="82" cy="18" r="30" fill="rgba(255,255,255,0.28)" />
          <Path
            d="M20 88 C 30 50, 60 40, 92 36 C 78 66, 52 84, 20 88 Z"
            fill="rgba(255,255,255,0.35)"
          />
          <Path
            d="M20 88 C 44 70, 60 58, 80 44"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="1.6"
            fill="none"
          />
        </Svg>
        <View style={styles.center}>
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: fonts.displayItalic,
              fontSize: fs,
              lineHeight: Math.round(fs * 1.3),
              includeFontPadding: false,
              textAlign: 'center',
              color: t.fg,
              opacity: 0.85,
            }}
          >
            {initial}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[dim, { borderRadius: radius, overflow: 'hidden', backgroundColor: t.bg }, style]}>
      <Image
        source={{ uri: src }}
        placeholder={blurhash ? { blurhash } : undefined}
        placeholderContentFit="cover"
        contentFit="cover"
        transition={260}
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey}
        priority={priority}
        onError={() => setFailed(true)}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
