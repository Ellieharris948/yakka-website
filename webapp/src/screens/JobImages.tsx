import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, Chip, Text, TextInput } from '../ui/paper';
import { supabase } from '../lib/supabase';
import { pickJobImage, removeJobImage, signJobImageRows, uploadJobImage } from '../utils/jobImages';
import { inferJobPhotoStage, JobPhotoStage } from '../utils/jobPhotoStage';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import ScreenState from '../components/ScreenState';

type Job = {
  id: string;
  ref_code: string | null;
  title: string;
  status: string;
  start_date: string | null;
};

type JobPhoto = {
  id: string;
  job_id: string;
  uploaded_by: string;
  file_url: string;
  storage_path?: string | null;
  stage: JobPhotoStage;
  note: string | null;
  created_at: string;
};

export default function JobImages({ route }: any) {
  const { jobId, intent } = route.params as { jobId: string; intent?: 'completion' };
  const nav = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: jobRow, error: jobErr } = await supabase.from('jobs').select('id,ref_code,title,status,start_date').eq('id', jobId).single();
    if (jobErr) {
      Alert.alert('Error', jobErr.message);
      setLoading(false);
      return;
    }
    setJob(jobRow as Job);

    const { data, error } = await supabase
      .from('job_photos')
      .select('id,job_id,uploaded_by,file_url,storage_path,stage,note,created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }
    try {
      setPhotos(await signJobImageRows((data || []) as JobPhoto[]));
    } catch {
      Alert.alert('Images unavailable', 'The images could not be opened securely. Please try again.');
      setPhotos([]);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    try {
      setUploading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Not signed in');

      const uri = await pickJobImage();
      if (!uri) return;
      const { storagePath } = await uploadJobImage(user.id, jobId, uri);

      const { error } = await supabase.from('job_photos').insert({
        job_id: jobId,
        uploaded_by: user.id,
        file_url: storagePath,
        storage_path: storagePath,
        stage,
        note: note.trim() || null,
      });
      if (error) {
        await removeJobImage(storagePath);
        throw error;
      }

      await supabase.from('messages').insert({
        job_id: jobId,
        sender_id: user.id,
        body: `Uploaded ${stage} photo${note.trim() ? `: ${note.trim()}` : ''}`,
      });

      setNote('');
      await load();
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  if (loading || !job) {
    return <ScreenState loading title="Loading job images" />;
  }

  const stage = inferJobPhotoStage(job, intent);
  const stageCopy = stage === 'before'
    ? { title: 'Before photos', body: 'These photos will be saved as the condition before work starts.' }
    : stage === 'after'
      ? { title: 'Completed-work photos', body: 'These photos will be saved as evidence of the finished work.' }
      : { title: 'Progress photos', body: 'These photos will be saved as updates taken while the job is in progress.' };

  return (
    <ResponsivePageScrollView keyboardShouldPersistTaps="handled">
      <BrandScreenHeader
        title={job.title}
        onBack={() => nav.goBack()}
        chipLabel={job.ref_code || job.id.slice(0, 6)}
      />

      <Card mode="contained" style={{ borderRadius: 24, marginTop: 20, marginBottom: 12 }}>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="headlineSmall">{stageCopy.title}</Text>
          <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
            {stageCopy.body}
          </Text>
          <TextInput mode="outlined" label="Note (optional)" value={note} onChangeText={setNote} multiline />
          <Button mode="contained" icon="image-plus" onPress={upload} loading={uploading} disabled={uploading} style={{ borderRadius: 18 }}>
            Upload {stage === 'before' ? 'before' : stage === 'after' ? 'completed' : 'progress'} photo
          </Button>
        </Card.Content>
      </Card>

      <View style={{ gap: 12 }}>
        {photos.map(photo => (
          <Card key={photo.id} mode="contained" style={{ borderRadius: 24 }}>
            <Image source={{ uri: photo.file_url }} style={{ width: '100%', height: 220, borderTopLeftRadius: 18, borderTopRightRadius: 18 }} resizeMode="cover" />
            <Card.Content style={{ gap: 6, paddingTop: 10 }}>
              <Chip compact>{photo.stage}</Chip>
              {!!photo.note && <Text variant="bodyMedium">{photo.note}</Text>}
              <Text variant="bodySmall" style={{ opacity: 0.65 }}>{new Date(photo.created_at).toLocaleString('en-GB')}</Text>
            </Card.Content>
          </Card>
        ))}

        {!photos.length && (
          <Card mode="contained" style={{ borderRadius: 24 }}>
            <Card.Content>
              <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
                No images uploaded yet.
              </Text>
            </Card.Content>
          </Card>
        )}
      </View>
    </ResponsivePageScrollView>
  );
}

