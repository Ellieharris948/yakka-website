import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, useWindowDimensions, View } from 'react-native';
import { Button, Card, IconButton, Text, TextInput, useTheme } from '../ui/paper';
import { useNavigation } from '@react-navigation/native';
import MCIcon from '../components/BrandIcon';
import BrandScreenFrame from '../components/BrandScreenFrame';
import {
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  useAccessibilitySettings,
} from '../context/AccessibilityContext';
import { BRAND_COLORS, BRAND_CONTENT_GAPS } from '../theme';
import { supabase } from '../lib/supabase';
import { isValidVatRegistrationNumber, normalizeVatRegistrationNumber, VAT_REGISTRATION_URL } from '../utils/vat';
import BrandSwitch from '../components/BrandSwitch';
import { BRAND_CONTENT_MAX_WIDTH, getResponsiveLayoutValue, getResponsiveScreenGutter } from '../utils/layout';

function FontSizeSelector({ embedded = false }: { embedded?: boolean }) {
  const { fontScale, setFontScale } = useAccessibilitySettings();
  const theme = useTheme();
  const foreground = embedded ? BRAND_COLORS.white : theme.colors.onSurface;
  const muted = embedded ? 'rgba(255,255,255,0.74)' : theme.colors.onSurfaceVariant;
  const [trackWidth, setTrackWidth] = useState(0);
  const percentage = Math.round(fontScale * 100);
  const progress = (fontScale - MIN_FONT_SCALE) / (MAX_FONT_SCALE - MIN_FONT_SCALE);
  const updateFromPosition = useCallback((position: number) => {
    if (trackWidth <= 0) return;
    const boundedProgress = Math.min(1, Math.max(0, position / trackWidth));
    setFontScale(MIN_FONT_SCALE + boundedProgress * (MAX_FONT_SCALE - MIN_FONT_SCALE));
  }, [setFontScale, trackWidth]);

  return (
    <View
      style={{
        gap: BRAND_CONTENT_GAPS.related,
        borderRadius: 16,
        padding: 12,
        backgroundColor: embedded
          ? 'rgba(255,255,255,0.08)'
          : theme.dark
            ? 'rgba(255,255,255,0.06)'
            : theme.colors.surfaceVariant,
      }}
    >
      <View>
        <Text variant="titleMedium" style={{ color: foreground }}>Font size</Text>
        <Text variant="bodySmall" style={{ color: muted }}>
          Apply one percentage to every text style.
        </Text>
      </View>

      <Text variant="headlineSmall" style={{ color: foreground, textAlign: 'center' }}>
        {percentage}%
      </Text>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Font size"
        accessibilityHint="Swipe left or right, or use accessibility actions, to change the text size"
        accessibilityValue={{ min: 80, max: 160, now: percentage, text: `${percentage}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          setFontScale(fontScale + (event.nativeEvent.actionName === 'decrement' ? -FONT_SCALE_STEP : FONT_SCALE_STEP));
        }}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => updateFromPosition(event.nativeEvent.locationX)}
        onResponderMove={(event) => updateFromPosition(event.nativeEvent.locationX)}
        style={{ height: 44, justifyContent: 'center' }}
      >
        <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.outlineVariant }}>
          <View style={{ width: `${progress * 100}%`, height: 8, borderRadius: 4, backgroundColor: BRAND_COLORS.orange }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: Math.max(0, Math.min(Math.max(0, trackWidth - 28), progress * trackWidth - 14)),
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 3,
            borderColor: BRAND_COLORS.white,
            backgroundColor: BRAND_COLORS.orange,
            shadowColor: BRAND_COLORS.maroon,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 4,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="labelMedium" style={{ color: muted }}>80%</Text>
        <Text variant="labelMedium" style={{ color: muted }}>160%</Text>
      </View>
    </View>
  );
}

type SettingsProps = {
  embedded?: boolean;
};

export default function Settings({ embedded = false }: SettingsProps = {}) {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);
  const foreground = embedded ? BRAND_COLORS.white : theme.colors.onSurface;
  const muted = embedded ? 'rgba(255,255,255,0.74)' : theme.colors.onSurfaceVariant;
  const cardBackground = embedded ? 'rgba(255,255,255,0.1)' : theme.colors.surface;
  const cardBorder = embedded ? 'rgba(255,255,255,0.16)' : theme.colors.outlineVariant;
  const previewBackground = embedded ? 'rgba(255,255,255,0.08)' : theme.colors.surfaceVariant;
  const cardShadow = {
    shadowColor: '#581a1f',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: embedded || theme.dark ? 0.18 : 0.08,
    shadowRadius: 12,
    elevation: 3,
  } as const;
  const { colorMode, setColorMode } = useAccessibilitySettings();
  const [role, setRole] = useState<'client' | 'trader' | 'admin' | null>(null);
  const [traderMode, setTraderMode] = useState<'solo' | 'team' | null>(null);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatRegistrationNumber, setVatRegistrationNumber] = useState('');
  const [vatInfoOpen, setVatInfoOpen] = useState(false);
  const [savingVat, setSavingVat] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const enhanced = await supabase.from('profiles').select('role,vat_registered,vat_registration_number').eq('id', user.id).maybeSingle();
      const fallback = enhanced.error
        ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
        : null;
      const data = enhanced.data || fallback?.data;
      setRole((data?.role as any) || null);
      setVatRegistered((data as any)?.vat_registered === true);
      setVatRegistrationNumber((data as any)?.vat_registration_number || '');
      const mode = user.user_metadata?.trader_mode;
      setTraderMode(mode === 'team' ? 'team' : mode === 'solo' ? 'solo' : null);
    });
  }, []);

  const saveVatSettings = useCallback(async () => {
    if (vatRegistered && !isValidVatRegistrationNumber(vatRegistrationNumber)) {
      Alert.alert('Check VAT number', 'Enter a valid UK VAT registration number, for example GB 123 4567 89.');
      return;
    }
    try {
      setSavingVat(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please log in again.');
      const formatted = vatRegistered ? normalizeVatRegistrationNumber(vatRegistrationNumber) : null;
      const { error } = await supabase.from('profiles').update({
        vat_registered: vatRegistered,
        vat_registration_number: formatted,
      }).eq('id', user.id);
      if (error) throw error;
      setVatRegistrationNumber(formatted || '');
      Alert.alert('VAT settings saved', 'Your VAT status will be used for new quotes. Existing quotes will not change.');
    } catch (error: any) {
      Alert.alert('Could not save VAT settings', error?.message || 'Please try again.');
    } finally {
      setSavingVat(false);
    }
  }, [vatRegistered, vatRegistrationNumber]);

  const settingsLink = (label: string, icon: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: BRAND_CONTENT_GAPS.related,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <MCIcon name={icon as any} size={23} color={foreground} />
      <Text variant="titleMedium" style={{ color: foreground, flex: 1 }}>{label}</Text>
      <MCIcon name="chevron-right" size={24} color={muted} />
    </Pressable>
  );

  const content = (
      <ScrollView testID="settings-content" contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: screenGutter, paddingTop: 24, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: BRAND_CONTENT_GAPS.related, marginBottom: BRAND_CONTENT_GAPS.section }}>
          <MCIcon name="settings" size={28} color={foreground} />
          <View style={{ flex: 1 }}>
            <Text variant="headlineMedium" style={{ color: foreground }}>Settings</Text>
            <Text variant="bodyMedium" style={{ color: muted }}>Make Yakka comfortable for you.</Text>
          </View>
        </View>

        <Card
          mode="contained"
          style={{
            ...cardShadow,
            borderRadius: 18,
            backgroundColor: cardBackground,
            borderWidth: 1,
            borderColor: cardBorder,
            marginBottom: 12,
          }}
        >
          <Card.Content style={{ gap: BRAND_CONTENT_GAPS.section, paddingVertical: 18 }}>
            <View>
              <Text variant="titleMedium" style={{ color: foreground }}>Appearance</Text>
              <Text variant="bodySmall" style={{ color: muted, marginTop: 3 }}>
                Dark mode swaps cream surfaces for Yakka burgundy.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: BRAND_CONTENT_GAPS.related }}>
              <Button
                mode={colorMode === 'light' ? 'contained' : 'outlined'}
                icon="white-balance-sunny"
                onPress={() => setColorMode('light')}
                textColor={colorMode === 'light' ? BRAND_COLORS.white : foreground}
                style={{ flex: 1, borderRadius: 18, borderColor: cardBorder }}
                contentStyle={{ minHeight: 42 }}
                labelStyle={{ lineHeight: 20, paddingBottom: 2 }}
              >
                Light
              </Button>
              <Button
                mode={colorMode === 'dark' ? 'contained' : 'outlined'}
                icon="weather-night"
                onPress={() => setColorMode('dark')}
                textColor={colorMode === 'dark' ? BRAND_COLORS.white : foreground}
                style={{ flex: 1, borderRadius: 18, borderColor: cardBorder }}
                contentStyle={{ minHeight: 42 }}
                labelStyle={{ lineHeight: 20, paddingBottom: 2 }}
              >
                Dark
              </Button>
            </View>
          </Card.Content>
        </Card>

        <Card
          mode="contained"
          style={{
            ...cardShadow,
            borderRadius: 18,
            backgroundColor: cardBackground,
            borderWidth: 1,
            borderColor: cardBorder,
          }}
        >
          <Card.Content style={{ gap: BRAND_CONTENT_GAPS.section, paddingVertical: 18 }}>
            <FontSizeSelector embedded={embedded} />

            <View style={{ borderRadius: 12, padding: 14, backgroundColor: previewBackground, gap: BRAND_CONTENT_GAPS.related }}>
              <Text variant="titleMedium" style={{ color: foreground }}>Preview</Text>
              <Text variant="bodyMedium" style={{ color: muted }}>
                Job details and messages will use this size in both client and tradie views.
              </Text>
            </View>

          </Card.Content>
        </Card>

        {role === 'trader' && (
          <Card mode="contained" style={{ ...cardShadow, borderRadius: 18, backgroundColor: cardBackground, borderWidth: 1, borderColor: cardBorder, marginTop: 12 }}>
            <Card.Content style={{ gap: 14, paddingVertical: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleLarge" style={{ color: foreground }}>VAT and quoting</Text>
                  <Text variant="bodySmall" style={{ color: muted, marginTop: 3 }}>VAT is applied automatically to new quotes.</Text>
                </View>
                <IconButton icon="information-outline" iconColor={BRAND_COLORS.orange} onPress={() => setVatInfoOpen(value => !value)} />
              </View>

              <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ color: foreground }}>VAT registered?</Text>
                  <Text variant="bodySmall" style={{ color: muted }}>{vatRegistered ? 'Yes' : 'No'}</Text>
                </View>
                <BrandSwitch value={vatRegistered} onValueChange={setVatRegistered} accessibilityLabel="VAT registered" />
              </View>

              {vatRegistered && (
                <TextInput
                  mode="outlined"
                  label="VAT registration number"
                  placeholder="e.g. GB 123 4567 89"
                  autoCapitalize="characters"
                  value={vatRegistrationNumber}
                  onChangeText={setVatRegistrationNumber}
                  onBlur={() => setVatRegistrationNumber(normalizeVatRegistrationNumber(vatRegistrationNumber))}
                  textColor={foreground}
                />
              )}

              {vatInfoOpen && (
                <View style={{ borderRadius: 16, padding: 14, gap: 8, backgroundColor: previewBackground }}>
                  <Text variant="titleMedium" style={{ color: foreground }}>What is VAT registration?</Text>
                  <Text variant="bodySmall" style={{ color: muted, lineHeight: 20 }}>
                    If your total business turnover exceeds £90,000 in any 12-month period, you are legally required to register for VAT with HMRC.
                  </Text>
                  <Text variant="bodySmall" style={{ color: muted, lineHeight: 20 }}>
                    If you&apos;re VAT registered, Yakka will automatically add 20% VAT to your quotes. Your customers will see the VAT broken out clearly, along with your VAT number so they can verify it.
                  </Text>
                  <Button mode="text" icon="open-in-new" onPress={() => Linking.openURL(VAT_REGISTRATION_URL)} textColor={BRAND_COLORS.orange}>
                    gov.uk/vat-registration
                  </Button>
                  <Text variant="bodySmall" style={{ color: muted, lineHeight: 20 }}>You can update your VAT status at any time in your profile settings.</Text>
                </View>
              )}

              <Button mode="contained" loading={savingVat} disabled={savingVat} onPress={saveVatSettings} style={{ borderRadius: 18 }}>
                Save VAT settings
              </Button>
            </Card.Content>
          </Card>
        )}

        {role === 'trader' && (
          <Card mode="contained" style={{ ...cardShadow, borderRadius: 18, backgroundColor: cardBackground, borderWidth: 1, borderColor: cardBorder, marginTop: 12 }}>
            <Card.Content style={{ gap: 2 }}>
              <Text variant="titleLarge" style={{ color: foreground, marginBottom: 6 }}>Payments and account</Text>
              {settingsLink('Stripe payout setup', 'bank-outline', () => nav.navigate('BankDetails'))}
              {settingsLink('View past jobs', 'history', () => nav.navigate('JobsBoard', { initialFilter: 'past', profileMode: 'trader_past' }))}
              {settingsLink(
                traderMode === 'team' ? 'Manage team members' : 'Switch to a team account',
                'account-group-outline',
                () => nav.navigate('TeamMembers', traderMode === 'team' ? undefined : { conversion: true }),
              )}
            </Card.Content>
          </Card>
        )}

        {role === 'client' && (
          <Card mode="contained" style={{ ...cardShadow, borderRadius: 18, backgroundColor: cardBackground, borderWidth: 1, borderColor: cardBorder, marginTop: 12 }}>
            <Card.Content style={{ gap: 2 }}>
              <Text variant="titleLarge" style={{ color: foreground, marginBottom: 6 }}>Account</Text>
              {settingsLink('View past jobs', 'history', () => nav.navigate('JobsBoard', { initialFilter: 'past', profileMode: 'client_past' }))}
            </Card.Content>
          </Card>
        )}

        <Card mode="contained" style={{ ...cardShadow, borderRadius: 18, backgroundColor: cardBackground, borderWidth: 1, borderColor: cardBorder, marginTop: 12 }}>
          <Card.Content style={{ gap: 2 }}>
            <Text variant="titleLarge" style={{ color: foreground, marginBottom: 6 }}>Account security</Text>
            {settingsLink('Change password', 'lock-reset', () => nav.navigate('ChangePassword'))}
          </Card.Content>
        </Card>

        <Card mode="contained" style={{ ...cardShadow, borderRadius: 18, backgroundColor: cardBackground, borderWidth: 1, borderColor: cardBorder, marginTop: 12 }}>
          <Card.Content style={{ gap: 2 }}>
            <Text variant="titleLarge" style={{ color: foreground, marginBottom: 6 }}>Support and legal</Text>
            {settingsLink('Contact us', 'headset', () => nav.navigate('ContactUs', { category: 'get_help' }))}
            {settingsLink('Report a bug', 'bug-outline', () => nav.navigate('ContactUs', { category: 'report_bug', subject: 'App bug' }))}
            {settingsLink('Share feedback', 'star-outline', () => nav.navigate('ReviewExperience', { mode: 'yakka' }))}
            {settingsLink('Terms & conditions', 'file-document-outline', () => nav.navigate('StaticInfo', { kind: 'terms' }))}
            {settingsLink('Privacy', 'shield-lock-outline', () => nav.navigate('StaticInfo', { kind: 'privacy' }))}
            {settingsLink('Manage cookies', 'cookie-outline', () => nav.navigate('StaticInfo', { kind: 'cookies' }))}
          </Card.Content>
        </Card>

        <Button
          mode="contained-tonal"
          icon="account-heart-outline"
          onPress={() => void Share.share({ message: 'Join me on Yakka: https://yakka.app' })}
          style={{ marginTop: 12 }}
        >
          Refer a friend
        </Button>
        <Button mode="text" icon="logout" textColor={foreground} onPress={() => supabase.auth.signOut()} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
          Log out
        </Button>
      </ScrollView>
  );

  if (embedded) return <View style={{ flex: 1 }}>{content}</View>;

  return (
    <BrandScreenFrame onBack={() => nav.goBack()}>
      {content}
    </BrandScreenFrame>
  );
}
