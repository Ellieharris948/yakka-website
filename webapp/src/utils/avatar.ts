import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

function extensionFromUri(uri: string) {
  const clean = uri.split('?')[0] || '';
  const ext = clean.split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpg' ? 'jpeg' : ext;
  return 'jpeg';
}

export async function pickProfileImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to upload a profile image.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.82,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function uploadAvatar(userId: string, uri: string) {
  const ext = extensionFromUri(uri);
  const contentType = `image/${ext}`;
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The selected profile image could not be read. Please choose it again.');
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadProfileDocument(userId: string, uri: string) {
  const ext = extensionFromUri(uri);
  const contentType = `image/${ext}`;
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The selected document could not be read. Please choose it again.');
  const path = `${userId}/accreditation-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('profile-documents').upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  return path;
}
