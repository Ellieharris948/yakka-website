import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, Text } from '../ui/paper';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';

export default function DisputeRaised({ route }: any) {
  const nav = useNavigation<any>();
  const jobId = route?.params?.jobId as string | undefined;
  const refCode = route?.params?.refCode as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader
          title={`Dispute raised - Job ${refCode || jobId || ''}`}
          onBack={() => nav.navigate('MainTabs')}
          chipLabel="Paused"
        />

        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="titleSmall" style={{ }}>Yakka will review this job</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.82 }}>
              A dispute has been raised regarding one or more items in your job breakdown.
            </Text>
            <Text variant="bodySmall" style={{ opacity: 0.72 }}>
              Payment for this job is temporarily paused while Yakka compares both sides against the agreed breakdown and evidence.
            </Text>
            {!!jobId && (
              <>
                <Button mode="contained" onPress={() => nav.navigate('JobDetails', { jobId })} style={{ borderRadius: 18 }}>
                  View job details
                </Button>
                <Button mode="contained-tonal" onPress={() => nav.navigate('ContactUs', { jobId })} style={{ borderRadius: 18 }}>
                  Contact Yakka
                </Button>
              </>
            )}
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}

