import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from 'react-native-paper';
import Text from '../components/BrandText';
import BrandScreenHeader from '../components/BrandScreenHeader';
import { PRIVACY_POLICY_SECTIONS } from '../content/privacyPolicy';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

const COPY: Record<string, { title: string; body: string[]; sections?: ReadonlyArray<{ title: string; body: string }> }> = {
  terms: {
    title: 'Terms & conditions',
    body: [
      'Yakka protects job payments by holding funds until work is confirmed complete.',
      'Jobs should use a clear task breakdown, agreed dates, and accurate pricing before payment is made.',
      'If there is a dispute, Yakka reviews the agreed breakdown, messages, and uploaded evidence before payment is released.',
      'If the customer and tradie cannot resolve a dispute themselves, both parties authorise Yakka to make the final decision on how the held job funds are distributed, based on the agreement and evidence available.',
    ],
  },
  privacy: {
    title: 'Privacy policy',
    body: [],
    sections: PRIVACY_POLICY_SECTIONS,
  },
  cookies: {
    title: 'Manage cookies',
    body: [
      'Cookie controls are mainly used on the web version of Yakka.',
      'The mobile app uses secure session storage to keep you signed in and to protect your account.',
    ],
  },
  fees: {
    title: 'Yakka fees',
    body: [
      'Customers pay the agreed protected total shown before payment is made, including any upfront materials that form part of that protected total.',
      'Customer payments are processed securely through Stripe. Yakka currently deducts a 5% tradie fee from the work value after payment is received.',
    ],
  },
};

export default function StaticInfo({ route }: any) {
  const nav = useNavigation<any>();
  const kind = String(route?.params?.kind || 'terms');
  const content = COPY[kind] || COPY.terms;

  return (
    <ResponsivePageScrollView>
      <BrandScreenHeader title={content.title} onBack={() => nav.goBack()} />

      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="headlineSmall" style={{ }}>{content.title}</Text>
          {content.body.map((paragraph, index) => (
            <Text key={index} variant="bodyMedium" style={{ opacity: 0.75 }}>
              {paragraph}
            </Text>
          ))}
          {content.sections?.map(section => (
            <View key={section.title} style={{ gap: 5 }}>
              <Text variant="titleMedium" style={{ }}>{section.title}</Text>
              <Text variant="bodyMedium" style={{ opacity: 0.78, lineHeight: 22 }}>{section.body}</Text>
            </View>
          ))}
        </Card.Content>
      </Card>
    </ResponsivePageScrollView>
  );
}

