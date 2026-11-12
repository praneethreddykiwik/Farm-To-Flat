import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const VEG = '#0A8A3A';
const NON_VEG = '#7A3B12';

/**
 * The veg / non-veg declaration every food listing in India must carry (FSS Labelling & Display
 * Regulations 2020, reg 5(4)): a green filled circle in a green-outlined square for vegetarian, a
 * brown filled TRIANGLE in a brown-outlined square for non-vegetarian — eggs and meat included.
 * The two differ in shape as well as colour, so the mark still reads for someone who cannot tell
 * green from brown.
 * @param {{ diet?: 'VEG'|'NONVEG'|string, size?: number, style?: any }} props
 */
export function DietMark({ diet, size = 16, style }) {
  const nonVeg = diet === 'NONVEG';
  const c = nonVeg ? NON_VEG : VEG;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={nonVeg ? 'Non-vegetarian' : 'Vegetarian'}
      style={[
        { width: size, height: size, backgroundColor: '#FFFFFF', borderRadius: size * 0.16 },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Rect
          x="1"
          y="1"
          width="14"
          height="14"
          rx="2"
          fill="#FFFFFF"
          stroke={c}
          strokeWidth="1.6"
        />
        {nonVeg ? (
          <Path d="M8 4.2 L12 11.6 H4 Z" fill={c} />
        ) : (
          <Circle cx="8" cy="8" r="3.4" fill={c} />
        )}
      </Svg>
    </View>
  );
}
