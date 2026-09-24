import { supabase } from './supabase';
import { parseRecoveryUrl } from '../utils/passwords';

type RecoveryState = { active: boolean; ready: boolean; error: string | null };
let state: RecoveryState = { active: false, ready: false, error: null };
let generation = 0;
const listeners = new Set<() => void>();
function publish(next: RecoveryState) {
  state = next;
  listeners.forEach(listener => listener());
}
export const getRecoveryState = () => state;
export function subscribeRecovery(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function clearRecovery() {
  generation += 1;
  publish({ active: false, ready: false, error: null });
}

// Process links above the auth navigator so cold/warm links survive session changes.
// A normal signed-in session alone never authorises this recovery screen.
export async function acceptRecoveryUrl(url: string | null) {
  const parsed = parseRecoveryUrl(url);
  if (!parsed) return;
  const attempt = ++generation;
  publish({ active: true, ready: false, error: parsed.error ?? null });
  if (!parsed.tokens) return;
  try {
    const { data, error } = await supabase.auth.setSession(parsed.tokens);
    if (attempt !== generation) return;
    if (error || !data.session) throw error || new Error('Invalid session');
    publish({ active: true, ready: true, error: null });
  } catch {
    if (attempt === generation) publish({ active: true, ready: false, error: 'This reset link is no longer valid. Request a new link from the login screen.' });
  }
}
