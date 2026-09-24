import React, { useEffect, useState } from 'react';
import { Alert, AlertButton, AlertOptions, View } from 'react-native';
import { Button, Text } from '../ui/paper';

import BottomCurtain from './BottomCurtain';

type Notice = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

export default function AppNoticeHost({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const originalAlert = Alert.alert;
    Alert.alert = (title, message, buttons, options) => {
      setNotice({
        title: String(title || 'Yakka'),
        message: message ? String(message) : undefined,
        buttons: buttons?.length ? buttons : [{ text: 'OK' }],
        options,
      });
    };
    return () => {
      Alert.alert = originalAlert;
    };
  }, []);

  const dismiss = () => {
    const cancelButton = notice?.buttons.find(button => button.style === 'cancel');
    setNotice(null);
    cancelButton?.onPress?.();
    notice?.options?.onDismiss?.();
  };

  return (
    <>
      {children}
      {notice && <BottomCurtain visible onDismiss={dismiss} title={notice.title}>
        <View style={{ gap: 16 }}>
          {!!notice?.message && <Text variant="bodyLarge" style={{ lineHeight: 24 }}>{notice.message}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            {(notice?.buttons || []).map((button, index) => (
              <Button
                key={`${button.text || 'OK'}-${index}`}
                mode={button.style === 'cancel' ? 'text' : button.style === 'destructive' ? 'contained-tonal' : 'contained'}
                onPress={() => {
                  setNotice(null);
                  button.onPress?.();
                }}
              >
                {button.text || 'OK'}
              </Button>
            ))}
          </View>
        </View>
      </BottomCurtain>}
    </>
  );
}
