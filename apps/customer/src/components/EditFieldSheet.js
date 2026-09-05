import React, { forwardRef, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Input, Sheet, Small } from '../ui';

/**
 * One-field editor used by the profile screen (name, email, recipient, landmark…).
 * Kept generic so every profile row edits the same way rather than each inventing its own sheet.
 *
 * @param {{ field: { key: string, label: string, value: string, placeholder?: string, hint?: string, keyboardType?: any, autoCapitalize?: any, maxLength?: number, validate?: (v: string) => string|null } | null, onSave: (key: string, value: string) => Promise<void>|void, saving?: boolean }} props
 */
export const EditFieldSheet = /** @type {any} */ (
  forwardRef(function EditFieldSheet(/** @type {any} */ { field, onSave, saving }, ref) {
    const [value, setValue] = useState('');
    const [error, setError] = useState(null);
    useEffect(() => {
      setValue(field?.value ?? '');
      setError(null);
    }, [field]);

    const submit = async () => {
      const v = value.trim();
      const problem = field?.validate?.(v);
      if (problem) {
        setError(problem);
        return;
      }
      // The parent owns the ref and closes the sheet, so this component never touches it.
      await onSave(field.key, v);
    };

    return (
      <Sheet ref={ref} title={field?.label || 'Edit'} subtitle={field?.hint} keyboard>
        <View>
          <Input
            label={field?.label}
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            placeholder={field?.placeholder}
            keyboardType={field?.keyboardType}
            autoCapitalize={field?.autoCapitalize ?? 'sentences'}
            maxLength={field?.maxLength}
            autoFocus
            error={error}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          <Button title="Save" onPress={submit} loading={saving} style={{ marginTop: 18 }} />
          <Small muted center style={{ marginTop: 10 }}>
            Stored against your account and used for delivery only.
          </Small>
        </View>
      </Sheet>
    );
  })
);
