import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from '../ui';

/** @param {{ categories: {id:string,name:string}[], selected: string|null, onSelect: (id: string|null) => void }} props */
export function CategoryChips({ categories, selected, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      <Chip label="All" selected={!selected} onPress={() => onSelect(null)} />
      {categories.map((c) => (
        <Chip
          key={c.id}
          label={c.name}
          selected={selected === c.id}
          onPress={() => onSelect(c.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ row: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 } });
