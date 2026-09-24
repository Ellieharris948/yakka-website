import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Text } from '../ui/paper';

import { BRAND_COLORS } from '../theme';
import BottomCurtain from './BottomCurtain';
import {
  copyTextToClipboard,
  shareViaEmail,
  shareViaSms,
  shareViaWhatsApp,
  shareWithSystemSheet,
} from '../utils/jobShare';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  shareLink: string;
  shareMessage: string;
  shareSubject: string;
  title?: string;
  subtitle?: string;
};

export default function ShareJobSheet({
  visible,
  onDismiss,
  shareLink,
  shareMessage,
  shareSubject,
  title = 'Share Job',
  subtitle = 'Choose how you want to share the secure Yakka job link.',
}: Props) {
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const runAction = useCallback(
    async (actionKey: string, action: () => Promise<void>) => {
      try {
        setBusyAction(actionKey);
        await action();
        onDismiss();
      } catch (e: any) {
        Alert.alert('Share job', e?.message || 'That sharing option is not available right now.');
      } finally {
        setBusyAction(null);
      }
    },
    [onDismiss],
  );

  return (
    <BottomCurtain
      visible={visible}
      onDismiss={busyAction ? () => {} : onDismiss}
      title={title}
      subtitle={subtitle}
    >
      <View style={{ gap: 12 }}>

            <Button
              mode="contained"
              onPress={() => runAction('copy', () => copyTextToClipboard(shareLink, 'Job link copied.'))}
              loading={busyAction === 'copy'}
              disabled={!!busyAction}
              buttonColor={BRAND_COLORS.orange}
              textColor={BRAND_COLORS.white}
              style={{ borderRadius: 18 }}
            >
              Copy link
            </Button>

            <Button
              mode="contained"
              onPress={() => runAction('whatsapp', () => shareViaWhatsApp(shareMessage))}
              loading={busyAction === 'whatsapp'}
              disabled={!!busyAction}
              buttonColor={BRAND_COLORS.orangeSoft}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: 18 }}
            >
              WhatsApp
            </Button>

            <Button
              mode="contained"
              onPress={() => runAction('sms', () => shareViaSms(shareMessage))}
              loading={busyAction === 'sms'}
              disabled={!!busyAction}
              buttonColor={BRAND_COLORS.orangeSoft}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: 18 }}
            >
              Message
            </Button>

            <Button
              mode="contained"
              onPress={() => runAction('email', () => shareViaEmail(shareSubject, shareMessage))}
              loading={busyAction === 'email'}
              disabled={!!busyAction}
              buttonColor={BRAND_COLORS.orangeSoft}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: 18 }}
            >
              Email
            </Button>

            <Button
              mode="contained"
              onPress={() => runAction('more', () => shareWithSystemSheet(shareMessage))}
              loading={busyAction === 'more'}
              disabled={!!busyAction}
              buttonColor={BRAND_COLORS.orangeSoft}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: 18 }}
            >
              More options
            </Button>

      </View>
    </BottomCurtain>
  );
}
