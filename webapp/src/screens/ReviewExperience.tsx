import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, Chip, Text, TextInput } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { getStoreReviewLabel, openStoreReview } from '../utils/externalLinks';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

export default function ReviewExperience({ route }: any) {
  const nav = useNavigation<any>();
  const jobId: string | undefined = route?.params?.jobId;
  const revieweeId: string | undefined = route?.params?.revieweeId;
  const mode: 'tradie' | 'yakka' = route?.params?.mode || 'tradie';

  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const options = [1, 2, 3, 4, 5];

  const title = 'How was your experience?';
  const canSubmit = useMemo(() => stars >= 1 && stars <= 5, [stars]);
  const storeReviewLabel = getStoreReviewLabel();

  const launchStoreReview = useCallback(async () => {
    try {
      setSending(true);
      setLaunchError(null);
      await openStoreReview();
    } catch (e: any) {
      setLaunchError(e?.message || `Could not open ${storeReviewLabel}.`);
    } finally {
      setSending(false);
    }
  }, [storeReviewLabel]);

  useEffect(() => {
    if (mode !== 'yakka') return;
    void launchStoreReview();
  }, [launchStoreReview, mode]);

  async function submit() {
    try {
      setSending(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (mode === 'tradie' && jobId && revieweeId && user?.id) {
        const { error } = await supabase.from('reviews').insert({
          job_id: jobId,
          reviewer_id: user.id,
          reviewee_id: revieweeId,
          stars,
          comment: comment.trim() || null,
          hidden: false,
        });
        if (error) throw error;
      } else {
        if (!user?.id) throw new Error('Not signed in');
        const payload = {
          user_id: user.id,
          job_id: jobId ?? null,
          target_type: mode,
          stars,
          comment: comment.trim() || null,
        };
        const { error } = await supabase.from('feedback').insert(payload);
        if (error) {
          await supabase.functions.invoke('send-incomplete', {
            body: { type: 'feedback', ...payload },
          });
        }
      }

      setSent(true);
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <ResponsivePageScrollView>
        <BrandScreenHeader title="Review" onBack={() => nav.navigate('MainTabs')} chipLabel="Submitted" />
        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
          <Card.Content style={{ gap: 12 }}>
            <Chip icon="check-circle-outline">Thank you</Chip>
            <Text variant="headlineSmall" style={{ }}>Review submitted</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
              Your feedback helps keep Yakka safe and reliable.
            </Text>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    );
  }

  if (mode === 'yakka') {
    return (
      <ResponsivePageScrollView>
        <BrandScreenHeader title="Share feedback" onBack={() => nav.goBack()} chipLabel={storeReviewLabel} />

        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
          <Card.Content style={{ gap: 12 }}>
            <Chip icon={launchError ? 'alert-circle-outline' : 'star-circle-outline'}>
              {launchError ? `${storeReviewLabel} unavailable` : sending ? `Opening ${storeReviewLabel}` : `${storeReviewLabel} opened`}
            </Chip>
            <Text variant="headlineSmall" style={{ }}>Share feedback</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.78, lineHeight: 22 }}>
              We&apos;ll open {storeReviewLabel} so you can leave a public review for Yakka.
            </Text>
            {!!launchError && (
              <Text variant="bodyMedium" style={{ opacity: 0.78, lineHeight: 22 }}>
                {launchError}
              </Text>
            )}
            <Button mode="contained" onPress={() => void launchStoreReview()} loading={sending} style={{ borderRadius: 18 }}>
              Open {storeReviewLabel}
            </Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    );
  }

  return (
    <ResponsivePageScrollView keyboardShouldPersistTaps="handled">
      <BrandScreenHeader title="Review" onBack={() => nav.goBack()} chipLabel="Rate experience" />

      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="headlineSmall" style={{ }}>{title}</Text>
          <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
            {mode === 'tradie' ? 'Your job is now complete. Let us know how they did.' : 'Your feedback helps keep Yakka safe and reliable.'}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {options.map(value => (
              <Button key={value} mode={stars === value ? 'contained' : 'contained-tonal'} onPress={() => setStars(value)}>
                {value} star{value === 1 ? '' : 's'}
              </Button>
            ))}
          </View>

          <TextInput
            mode="outlined"
            label="Anything we should know? (optional)"
            value={comment}
            onChangeText={setComment}
            multiline
          />

          <Button
            mode="contained"
            onPress={submit}
            disabled={sending || !canSubmit}
            loading={sending}
            style={{ borderRadius: 18 }}
            contentStyle={{ paddingVertical: 8 }}
          >
            Submit review
          </Button>
        </Card.Content>
      </Card>
    </ResponsivePageScrollView>
  );
}

