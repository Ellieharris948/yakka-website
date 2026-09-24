import { Linking, Platform } from 'react-native';

export const SUPPORT_EMAIL = 'gnashstudio@gmail.com';
const ANDROID_PACKAGE_NAME = 'com.anonymous.yakka';
const IOS_APP_STORE_SEARCH_URL = 'https://apps.apple.com/gb/search?term=YAKKA';
const IOS_APP_STORE_SEARCH_DEEP_LINK = 'itms-apps://itunes.apple.com/search?term=YAKKA&entity=software';

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

export async function openSupportEmail(params: {
  body: string;
  subject: string;
  to?: string;
}) {
  const to = params.to || SUPPORT_EMAIL;
  const mailtoUrl =
    `mailto:${to}?subject=${encodeQueryValue(params.subject)}&body=${encodeQueryValue(params.body)}`;

  const canOpen = await Linking.canOpenURL(mailtoUrl);
  if (!canOpen) {
    throw new Error(`No email app is available. Please email ${to} manually.`);
  }

  await Linking.openURL(mailtoUrl);
}

export function getStoreReviewLabel() {
  return Platform.OS === 'android' ? 'Google Play' : 'App Store';
}

export async function openStoreReview() {
  try {
    if (Platform.OS === 'android') {
      const deepLink = `market://details?id=${ANDROID_PACKAGE_NAME}`;
      const webUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;
      const canOpenDeepLink = await Linking.canOpenURL(deepLink);
      await Linking.openURL(canOpenDeepLink ? deepLink : webUrl);
      return;
    }

    const canOpenDeepLink = await Linking.canOpenURL(IOS_APP_STORE_SEARCH_DEEP_LINK);
    await Linking.openURL(canOpenDeepLink ? IOS_APP_STORE_SEARCH_DEEP_LINK : IOS_APP_STORE_SEARCH_URL);
  } catch {
    throw new Error(`${getStoreReviewLabel()} is not available until YAKKA is listed.`);
  }
}
