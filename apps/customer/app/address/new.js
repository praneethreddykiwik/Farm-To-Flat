import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { X } from 'lucide-react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Display, Glass, Pressy, Screen } from '../../src/ui';
import { AddressForm } from '../../src/components/AddressForm';
import { selectCustomer } from '../../src/features/auth/authSlice';
import { colors, radius } from '../../src/theme';

export default function NewAddress() {
  const router = useRouter();
  const customer = useSelector(selectCustomer);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <Screen edges={['top']}>
          <View style={styles.header}>
            <Display>New address</Display>
            <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Close">
              <Glass radius={radius.pill} innerStyle={styles.close}>
                <X size={20} color={colors.ink} />
              </Glass>
            </Pressy>
          </View>
          <AddressForm
            defaultName={customer?.name}
            mobile={customer?.mobile}
            onSaved={() => router.back()}
          />
        </Screen>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 20,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
