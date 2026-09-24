import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, Chip, Text, TextInput } from '../ui/paper';
import { supabase } from '../lib/supabase';
import BrandScreenHeader from '../components/BrandScreenHeader';
import { BRAND_COLORS } from '../theme';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

type SupportCategory = 'get_help' | 'report_bug' | 'account' | 'payment' | 'other';

const CATEGORY_OPTIONS: Array<{ value: SupportCategory; label: string }> = [
  { value: 'get_help', label: 'Get help' },
  { value: 'report_bug', label: 'Report bug' },
  { value: 'account', label: 'Account' },
  { value: 'payment', label: 'Payment' },
  { value: 'other', label: 'Other' },
];

export default function ContactUs({ route }: any) {
  const nav = useNavigation<any>();
  const jobId: string | undefined = route?.params?.jobId;
  const initialSubject: string = String(route?.params?.subject || '');
  const initialCategory = String(route?.params?.category || 'get_help') as SupportCategory;

  const [userId, setUserId] = useState('');
  const [category, setCategory] = useState<SupportCategory>(
    CATEGORY_OPTIONS.some(option => option.value === initialCategory) ? initialCategory : 'get_help',
  );
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || ''));
  }, []);

  const canSend = useMemo(
    () => subject.trim().length >= 3 && message.trim().length >= 10 && !sending,
    [message, sending, subject],
  );

  async function submitRequest() {
    if (!canSend) return;

    try {
      setSending(true);
      const { data, error } = await supabase.functions.invoke('submit-support-request', {
        body: {
          category,
          subject: subject.trim(),
          message: message.trim(),
          jobId: jobId || null,
        },
      });

      if (error) throw error;
      if (!data?.requestNumber) throw new Error(data?.error || 'Yakka did not return a request number.');

      setRequestNumber(String(data.requestNumber));
      setEmailWarning(data.emailSent === false ? String(data.emailWarning || 'The email confirmation is delayed.') : null);
    } catch (error: any) {
      Alert.alert('Could not send request', error?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (requestNumber) {
    return (
      <ResponsivePageScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <BrandScreenHeader title="Contact us" onBack={() => nav.goBack()} chipLabel="Received" />

        <View style={{ flex: 1, justifyContent: 'center', marginTop: 20 }}>
          <Card mode="contained" style={{ borderRadius: 28, backgroundColor: BRAND_COLORS.creamSoft }}>
            <Card.Content style={{ gap: 18, paddingVertical: 30 }}>
              <Text variant="headlineSmall" style={{ textAlign: 'center', color: BRAND_COLORS.maroon, }}>
                Thank you for contacting us.
              </Text>
              <Text variant="titleLarge" style={{ textAlign: 'center', color: BRAND_COLORS.maroon, }}>
                We have received your request and will get back to you as soon as possible.
              </Text>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Text variant="labelLarge">Your request number</Text>
                <Chip icon="ticket-confirmation-outline" textStyle={{ }}>
                  {requestNumber}
                </Chip>
              </View>
              {!emailWarning ? (
                <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.72 }}>
                  We have also emailed a confirmation to the address on your Yakka account.
                </Text>
              ) : (
                <Text variant="bodyMedium" style={{ textAlign: 'center', color: BRAND_COLORS.maroon }}>
                  {emailWarning}
                </Text>
              )}
            </Card.Content>
          </Card>
        </View>
      </ResponsivePageScrollView>
    );
  }

  return (
    <ResponsivePageScrollView keyboardShouldPersistTaps="handled">
      <BrandScreenHeader title="Contact us" onBack={() => nav.goBack()} />

      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20, backgroundColor: BRAND_COLORS.creamSoft }}>
        <Card.Content style={{ gap: 16 }}>
          <View style={{ gap: 5 }}>
            <Text variant="labelLarge" style={{ color: BRAND_COLORS.maroon, }}>
              Yakka account ID
            </Text>
            <Text variant="bodyMedium" selectable style={{ opacity: 0.72 }}>
              {userId || 'Loading...'}
            </Text>
            {!!jobId && <Chip compact>Job {jobId.slice(0, 8)}</Chip>}
          </View>

          <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, }}>
            What can we help with?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORY_OPTIONS.map(option => (
              <Chip
                key={option.value}
                selected={category === option.value}
                showSelectedCheck
                onPress={() => setCategory(option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </View>

          <TextInput
            mode="outlined"
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            maxLength={140}
          />
          <TextInput
            mode="outlined"
            label="Please let us know how we can help"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={10}
            maxLength={5000}
            style={{ minHeight: 220 }}
          />
          <Text variant="bodySmall" style={{ textAlign: 'right', opacity: 0.62 }}>
            {message.length}/5000
          </Text>

          <Button
            mode="contained"
            buttonColor={BRAND_COLORS.orange}
            onPress={submitRequest}
            loading={sending}
            disabled={!canSend}
            style={{ borderRadius: 18 }}
          >
            Send
          </Button>
        </Card.Content>
      </Card>
    </ResponsivePageScrollView>
  );
}
