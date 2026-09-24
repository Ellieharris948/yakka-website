import { supabase } from '../lib/supabase';
import { normalizeUkPhone } from '../utils/phone';

type AppRole = 'client' | 'trader';

function roleFromMetadata(value: unknown): AppRole | null {
  const role = String(value || '').toLowerCase();
  if (role === 'trader') return 'trader';
  if (role === 'client') return 'client';
  return null;
}

export async function ensureMyProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');

  const meta = user.user_metadata || {};
  const requestedRole = roleFromMetadata(meta.role);
  const payload = {
    id: user.id,
    email: user.email ?? null,
    role: requestedRole ?? 'client',
    name: meta.name ?? meta.full_name ?? null,
    phone: normalizeUkPhone(meta.phone) || null,
    country_code: 'GB',
  };

  const enhancedRead = await supabase
    .from('profiles')
    .select('id,name,role,email,phone,avatar_url,location,bio,tags,country_code,trader_mode,qualifications,business_accreditations,public_liability_insurance,vat_registered,vat_registration_number')
    .eq('id', user.id)
    .maybeSingle();
  const fallbackRead = enhancedRead.error
    ? await supabase
        .from('profiles')
        .select('id,name,role,email,phone,avatar_url,location,bio,tags,country_code')
        .eq('id', user.id)
        .maybeSingle()
    : null;
  const existing = fallbackRead?.data ?? enhancedRead.data;

  if (!existing) {
    const { data, error } = await supabase.from('profiles').insert(payload).select('*').single();
    if (error) throw error;
    return data;
  }

  const patch: Record<string, any> = {};
  if (!existing.name && payload.name) patch.name = payload.name;
  if (!existing.email && payload.email) patch.email = payload.email;
  if (requestedRole === 'trader' && existing.role !== 'trader' && existing.role !== 'admin') {
    patch.role = 'trader';
  } else if (!existing.role && requestedRole) {
    patch.role = requestedRole;
  }
  if (!existing.phone && payload.phone) patch.phone = payload.phone;
  if (!existing.country_code) patch.country_code = 'GB';

  if (Object.keys(patch).length) {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select('*').single();
    if (error) throw error;
    return data;
  }

  return existing;
}

export async function setRole(role: 'client'|'trader') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id);
  if (error) throw error;
}
