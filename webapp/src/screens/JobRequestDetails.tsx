import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Text } from '../ui/paper';
import { supabase } from '../lib/supabase';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import ScreenState from '../components/ScreenState';

export default function JobRequestDetails({ route }: any) {
  const nav = useNavigation<any>();
  const jobId = route?.params?.jobId as string;
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      if (error) Alert.alert('Error', error.message);
      setJob(data);
      setLoading(false);
    })();
  }, [jobId]);

  if (loading) {
    return <ScreenState loading title="Loading job request" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ResponsivePageScrollView>
        <BrandScreenHeader
          title="Job request"
          onBack={() => nav.goBack()}
          chipLabel={job?.ref_code || 'Request'}
        />

        <Card mode="contained" style={{ borderRadius: 24, marginTop: 20 }}>
          <Card.Content style={{ gap: 12 }}>
            <Text variant="headlineSmall" style={{ }}>{job?.title || 'Job request'}</Text>
            <Text variant="bodySmall" style={{ opacity: 0.65 }}>Customer has requested the below job.</Text>
            {!!job?.description && <Text variant="bodyMedium" style={{ opacity: 0.8 }}>{job.description}</Text>}
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Click below and fill out the remaining details, task breakdown, and pricing.
            </Text>
            <Button mode="contained" icon="file-document-edit-outline" onPress={() => nav.navigate('JobDetails', { jobId })} style={{ borderRadius: 18 }}>
              Input job details
            </Button>
            <Button mode="contained-tonal" icon="message-text-outline" onPress={() => nav.navigate('Chat', { jobId })} style={{ borderRadius: 18 }}>
              Message customer
            </Button>
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>
    </View>
  );
}

