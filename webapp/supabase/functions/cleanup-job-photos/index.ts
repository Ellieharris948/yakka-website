import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const expected = Deno.env.get('CLEANUP_SECRET') || '';
  if (!expected || req.headers.get('x-cleanup-secret') !== expected) return jsonResponse({ error: 'Unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: photos, error } = await admin.from('job_photos').select('id,storage_path').lte('delete_after', new Date().toISOString()).limit(500);
  if (error) return jsonResponse({ error: error.message }, 500);
  const paths = (photos || []).map(photo => photo.storage_path).filter(Boolean) as string[];
  if (paths.length) {
    const { error: storageError } = await admin.storage.from('job-images').remove(paths);
    if (storageError) return jsonResponse({ error: storageError.message }, 500);
  }
  const ids = (photos || []).map(photo => photo.id);
  if (ids.length) await admin.from('job_photos').delete().in('id', ids);
  return jsonResponse({ deleted: ids.length });
});
