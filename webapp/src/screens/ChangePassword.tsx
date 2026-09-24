import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, HelperText, Text, TextInput, useTheme } from '../ui/paper';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { supabase } from '../lib/supabase';
import { passwordValidationError } from '../utils/passwords';

export default function ChangePassword() {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = passwordValidationError(password, confirmation);
  async function save() {
    if (saving || !current || validation) return;
    setError(null);
    setSaving(true);
    try {
      if (current === password) throw new Error('Choose a different password from your current password.');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error('Please log in again before changing your password.');
      const { data, error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (verifyError || data.user?.id !== user.id) throw new Error('Your current password is incorrect. Please try again.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setCurrent('');
      setPassword('');
      setConfirmation('');
      // Revoke refresh sessions on all devices after a credential change.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) {
        Alert.alert('Password changed', 'Your new password is saved, but we could not sign out other devices. Please retry logging out from Settings.');
        nav.goBack();
        return;
      }
      Alert.alert('Password changed', 'Please log in again using your new password.');
    } catch (e: any) {
      setError(e?.message || 'Could not change your password. Please try again.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
        <BrandScreenHeader title="Change password" onBack={() => { if (!saving) nav.goBack(); }} />
        <Card mode="contained">
          <Card.Content style={{ gap: 14 }}>
            <Text variant="titleLarge">Keep your account secure</Text>
            <Text variant="bodyMedium">Use at least 12 characters. You will need to log in again after changing your password.</Text>
            <TextInput label="Current password" accessibilityLabel="Current password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" value={current} onChangeText={setCurrent} disabled={saving} />
            <TextInput label="New password" accessibilityLabel="New password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" value={password} onChangeText={setPassword} disabled={saving} />
            <TextInput label="Confirm new password" accessibilityLabel="Confirm new password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" value={confirmation} onChangeText={setConfirmation} disabled={saving} />
            {!!password && !!validation && <HelperText type="error">{validation}</HelperText>}
            {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text>}
            <Button mode="contained" onPress={save} loading={saving} disabled={saving || !current || !!validation}>Save new password</Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}
