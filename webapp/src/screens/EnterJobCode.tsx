import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MCIcon from '../components/BrandIcon';
import { Button, Card, Text, TextInput, useTheme } from '../ui/paper';
import { supabase } from '../lib/supabase';
import BrandScreenFrame from '../components/BrandScreenFrame';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import { BRAND_COLORS, BRAND_GRADIENT, BRAND_TYPOGRAPHY } from '../theme';

export default function EnterJobCode() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const theme = useTheme();
  const [code, setCode] = useState(route?.params?.prefillRef ? String(route.params.prefillRef).toUpperCase() : '');
  const [role, setRole] = useState<'client' | 'trader' | 'admin' | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      setRole((data?.role as any) ?? null);
    })();
  }, []);

  const join = useCallback(async () => {
    const ref = code.trim().toUpperCase();
    if (!ref) {
      Alert.alert('Missing code', 'Enter the job code from the link.');
      return;
    }
    try {
      setJoining(true);
      const { data, error } = await supabase.rpc('join_job_by_ref', { p_ref: ref });
      if (error) throw error;
      Alert.alert('Linked', role === 'trader' ? 'This job request is ready for your breakdown.' : 'You are linked to this job.');
      if (role === 'trader') {
        nav.replace('JobRequestDetails', { jobId: data.id });
        return;
      }

      const { data: jobRow } = await supabase
        .from('jobs')
        .select('id,status,price_cents')
        .eq('id', data.id)
        .maybeSingle();

      const shouldReviewBreakdown =
        !!jobRow &&
        ['proposed', 'accepted'].includes(String(jobRow.status)) &&
        Number(jobRow.price_cents || 0) > 0;

      nav.replace(shouldReviewBreakdown ? 'ReviewBreakdown' : 'JobDetails', { jobId: data.id });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('REF_NOT_FOUND')) Alert.alert('Cannot find job', 'Check the code and try again.');
      else if (msg.includes('REF_ALREADY_LINKED')) Alert.alert('Already linked', 'This job is already linked to someone else.');
      else Alert.alert('Could not join job', msg || 'Please try again.');
    } finally {
      setJoining(false);
    }
  }, [code, nav, role]);

  return (
    <BrandScreenFrame
      title="Enter job code"
      onBack={() => nav.goBack()}
    >
      <ResponsivePageScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          maxWidth: 560,
          paddingTop: 28,
          paddingBottom: 44,
        }}
      >
        <View style={{ alignItems: 'center', paddingHorizontal: 12, paddingBottom: 22 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: BRAND_GRADIENT[0],
              shadowColor: '#581a1f',
              shadowOffset: { width: 0, height: 7 },
              shadowOpacity: 0.18,
              shadowRadius: 14,
              elevation: 6,
            }}
          >
            <MCIcon name="shield-key-outline" size={31} color={BRAND_COLORS.white} />
          </View>
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, textAlign: 'center', marginTop: 16 }}>
            Enter your secure job code
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21, marginTop: 7 }}>
            {role === 'trader'
              ? 'Use the code from your customer to open their request and prepare the job details.'
              : 'Use the code from your tradie to connect safely to the correct job.'}
          </Text>
        </View>

        <Card
          mode="contained"
          style={{
            borderRadius: 26,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            shadowColor: '#581a1f',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: theme.dark ? 0.24 : 0.1,
            shadowRadius: 18,
            elevation: 5,
          }}
        >
          <Card.Content style={{ gap: 14, paddingHorizontal: 18, paddingVertical: 20 }}>
            <View style={{ gap: 4 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>Job code</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1, textAlign: 'center' }}>
                Codes are not case-sensitive.
              </Text>
            </View>
            <TextInput
              mode="outlined"
              placeholder="e.g. YAK-4829"
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Job code"
              value={code}
              onChangeText={value => setCode(value.toUpperCase())}
              activeOutlineColor={BRAND_COLORS.orange}
              left={<TextInput.Icon icon="ticket-confirmation-outline" color={BRAND_COLORS.orange} />}
              outlineStyle={{ borderRadius: 18 }}
              style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: theme.colors.surfaceVariant }}
              contentStyle={{ minHeight: 58, ...BRAND_TYPOGRAPHY.jobCode, letterSpacing: 1 }}
              returnKeyType="done"
              onSubmitEditing={() => void join()}
            />
            <Button
              mode="contained"
              icon="arrow-right"
              buttonColor={BRAND_COLORS.orange}
              textColor={BRAND_COLORS.white}
              loading={joining}
              disabled={joining || !code.trim()}
              onPress={join}
              style={{ borderRadius: 18 }}
              contentStyle={{ minHeight: 54 }}
            >
              {role === 'trader' ? 'Input job details' : 'Continue'}
            </Button>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <MCIcon name="lock-outline" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                We only use this code to connect you to the job.
              </Text>
            </View>
          </Card.Content>
        </Card>

      </ResponsivePageScrollView>
    </BrandScreenFrame>
  );
}

