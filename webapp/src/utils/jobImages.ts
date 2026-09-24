import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { JobPhotoStage } from './jobPhotoStage';

const JOB_IMAGE_LINK_LIFETIME_SECONDS = 60 * 60;

type StoredJobImage = {
  storage_path?: string | null;
  file_url?: string | null;
};

function pathFromStoredJobImage(photo: StoredJobImage | string) {
  const value = typeof photo === 'string'
    ? photo
    : photo.storage_path || photo.file_url || '';
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return value;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');

  try {
    const parsed = new URL(value);
    const marker = '/storage/v1/object/public/job-images/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return '';
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return '';
  }
}

export async function getJobImageUrl(photo: StoredJobImage | string) {
  const storagePath = pathFromStoredJobImage(photo);
  if (!storagePath) return null;
  if (storagePath.startsWith('data:') || storagePath.startsWith('blob:')) return storagePath;

  const { data, error } = await supabase.storage
    .from('job-images')
    .createSignedUrl(storagePath, JOB_IMAGE_LINK_LIFETIME_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export async function signJobImageRows<T extends StoredJobImage>(rows: T[]) {
  return Promise.all(rows.map(async row => ({
    ...row,
    file_url: await getJobImageUrl(row),
  })));
}

export function isTrustedJobImageUrl(value: string | null | undefined) {
  if (!value || !/^https?:\/\//i.test(value)) return false;
  try {
    const storageUrl = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!);
    const candidate = new URL(value);
    return candidate.origin === storageUrl.origin
      && candidate.pathname.includes('/storage/v1/object/sign/job-images/');
  } catch {
    return false;
  }
}

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

  const imageUrl = await getJobImageUrl(path);
  if (!imageUrl) throw new Error('The uploaded image could not be opened securely.');
  return { imageUrl, storagePath: path };
}

export async function removeJobImage(storagePath: string) {
  await supabase.storage.from('job-images').remove([storagePath]);
}
