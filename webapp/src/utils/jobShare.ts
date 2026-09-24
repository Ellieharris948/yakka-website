import { Alert, Linking, Platform, Share } from 'react-native';

export function buildCustomerJobShare(refCode: string) {
  const upper = String(refCode).toUpperCase();
  const link = `https://yakka.app/join/${upper}`;
  const appLink = `yakka://join/${upper}`;
  const message = `Hi, I have created a new job on YAKKA.

Open this link to add the job details and pricing:
${link}

Job code: ${upper}
If the link does not open the app, try: ${appLink}`;

  return {
    link,
    message,
    subject: `YAKKA job ${upper}`,
  };
}

export async function copyTextToClipboard(text: string, successMessage = 'Copied to clipboard.') {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      await (navigator as any).clipboard.writeText(text);
      Alert.alert('Copied', successMessage);
      return;
    }
  } catch {}

  try {
    // @ts-ignore optional dependency
    const Clipboard = require('@react-native-clipboard/clipboard')?.default;
    if (Clipboard?.setString) {
      Clipboard.setString(text);
      Alert.alert('Copied', successMessage);
      return;
    }
  } catch {}

  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert('Copy link', text);
  }
}

async function openUrl(primaryUrl: string, fallbackUrl: string | undefined, fallbackMessage: string) {
  try {
    const canOpenPrimary = await Linking.canOpenURL(primaryUrl);
    if (canOpenPrimary) {
      await Linking.openURL(primaryUrl);
      return;
    }
  } catch {}

  if (fallbackUrl) {
    try {
      const canOpenFallback = await Linking.canOpenURL(fallbackUrl);
      if (canOpenFallback) {
        await Linking.openURL(fallbackUrl);
        return;
      }
    } catch {}
  }

  await Share.share({ message: fallbackMessage });
}

export async function shareViaWhatsApp(message: string) {
  const encoded = encodeURIComponent(message);
  await openUrl(`whatsapp://send?text=${encoded}`, `https://wa.me/?text=${encoded}`, message);
}

export async function shareViaSms(message: string) {
  const encoded = encodeURIComponent(message);
  const smsUrl =
    Platform.OS === 'ios'
      ? `sms:&body=${encoded}`
      : `sms:?body=${encoded}`;
  await openUrl(smsUrl, undefined, message);
}

export async function shareViaEmail(subject: string, message: string) {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(message);
  await openUrl(`mailto:?subject=${encodedSubject}&body=${encodedBody}`, undefined, message);
}

export async function shareWithSystemSheet(message: string) {
  await Share.share({ message });
}
