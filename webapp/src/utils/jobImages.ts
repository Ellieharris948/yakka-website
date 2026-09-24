import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { JobPhotoStage } from './jobPhotoStage';

export async function hasJobPhotoStage(jobId: string, userId: string, stage: JobPhotoStage) {
  const { count, error } = await supabase
    .from('job_photos')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('uploaded_by', userId)
    .eq('stage', stage);
  if (error) throw error;
  return (count || 0) > 0;
}

function extensionFromUri(uri: string) {
  const clean = uri.split('?')[0] || '';
  const ext = clean.split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpg' ? 'jpeg' : ext;
  return 'jpeg';
}

export async function pickJobImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to upload job images.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.86,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function uploadJobImage(userId: string, jobId: string, uri: string) {
  const ext = extensionFromUri(uri);
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The selected job image could not be read. Please choose it again.');
  const path = `${jobId}/${userId}/job-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('job-images').upload(path, bytes, {
    contentType: `image/${ext}`,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('job-images').getPublicUrl(path);
  return { publicUrl: data.publicUrl, storagePath: path };
}

export async function removeJobImage(storagePath: string) {
  const { error } = await supabase.storage.from('job-images').remove([storagePath]);
  if (error) console.warn('Could not remove an incomplete job-image upload:', error.message);
}
