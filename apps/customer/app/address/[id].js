import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import { MapPinOff, X } from 'lucide-react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Display, EmptyState, Glass, Pressy, Screen } from '../../src/ui';
import { AddressForm } from '../../src/components/AddressForm';
import { useGetAddressesQuery } from '../../src/api/api';
import { showToast } from '../../src/features/ui/uiSlice';
import { colors, radius } from '../../src/theme';

/**
 * Edit one saved address. The same form as a new address, opened on what is already there.
 *
 * It reads the address out of the list the profile has already loaded, so the form is filled the
 * moment the screen opens; a cold deep link waits on that one request instead.
 */
export default function EditAddress() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { id } = useLocalSearchParams();
  const { data, isLoading } = useGetAddressesQuery();
  const address = (data?.addresses || []).find((a) => a.id === id);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <Screen edges={['top']}>
          <View style={styles.header}>
            <Display>Edit address</Display>
            <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Close">
              <Glass radius={radius.pill} innerStyle={styles.close}>
                <X size={20} color={colors.ink} />
              </Glass>
            </Pressy>
          </View>
          {address ? (
            <AddressForm
              // Keyed by id, so the form can never be showing one address while saving another.
              key={address.id}
              address={address}
              mobile={address.contactNumber}
              onSaved={() => {
                dispatch(showToast({ title: 'Address updated', tone: 'success' }));
                router.back();
              }}
            />
          ) : isLoading ? (
            <View style={styles.wait}>
              <ActivityIndicator color={colors.leaf} />
            </View>
          ) : (
            <EmptyState
              icon={<MapPinOff size={28} color={colors.ink} />}
              title="That address is gone"
              message="It is no longer on your account. Your other addresses are in your profile."
              action={{ title: 'Back to profile', onPress: () => router.back() }}
            />
          )}
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
  wait: { paddingTop: 60, alignItems: 'center' },
});
