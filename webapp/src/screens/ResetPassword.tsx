import React, { useState, useSyncExternalStore } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, HelperText, Text, TextInput, useTheme } from '../ui/paper';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { supabase } from '../lib/supabase';
import { clearRecovery, getRecoveryState, subscribeRecovery } from '../lib/passwordRecovery';
import { passwordValidationError } from '../utils/passwords';

export default function ResetPassword() {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const recovery = useSyncExternalStore(subscribeRecovery, getRecoveryState, getRecoveryState);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = passwordValidationError(password, confirmation);
  const checking = recovery.active && !recovery.ready && !recovery.error;

  function finish() {
    // Remove recovery credentials from web history after they have been used.
    if (Platform.OS === 'web') window.history.replaceState(null, '', '/');
    nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
    if (recovery.active) clearRecovery();
  }
  async function backToLogin() {
    if (saving) return;
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) { setError('Could not sign out. Please try again.'); return; }
    finish();
  }
  async function save() {
    if (saving || !recovery.ready || validation) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirmation('');
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) {
        setError('Your password was changed, but sign-out failed. Return to login and use your new password.');
        return;
      }
      finish();
      Alert.alert('Password updated', 'Please log in using your new password.');
    } catch (e: any) {
      setError(e?.message || 'Could not update your password. Request a new reset link if this one has expired.');
    } finally { setSaving(false); }
  }
  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <BrandScreenHeader title="Reset password" onBack={() => { void backToLogin(); }} />
        <Card mode="contained">
          <Card.Content style={{ gap: 14 }}>
            <Text variant="titleLarge">Set a new password</Text>
            <Text variant="bodyMedium">{checking ? 'Checking your secure reset link…' : recovery.ready ? 'Use at least 12 characters. A memorable passphrase works well.' : recovery.error || 'Open the secure reset link from your email to continue.'}</Text>
            {checking && <ActivityIndicator />}
            <TextInput label="New password" accessibilityLabel="New password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" value={password} onChangeText={setPassword} disabled={!recovery.ready || saving} />
            <TextInput label="Confirm new password" accessibilityLabel="Confirm new password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" value={confirmation} onChangeText={setConfirmation} disabled={!recovery.ready || saving} />
            {!!password && !!validation && <HelperText type="error">{validation}</HelperText>}
            {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text>}
            <Button mode="contained" onPress={save} loading={saving} disabled={saving || !recovery.ready || !!validation}>Update password</Button>
            <Button mode="text" onPress={backToLogin} disabled={saving}>Back to login</Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}
