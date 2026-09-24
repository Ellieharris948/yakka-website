import { supabase } from '../lib/supabase';

async function readFunctionError(error: any) {
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') {
    return error?.message || 'The request failed.';
  }

  try {
    const payload = await response.clone().json();
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
  } catch {
    // Fall back to plain text below.
  }

  try {
    const text = await response.clone().text();
    if (text.trim()) return text.trim();
  } catch {
    // Fall through to the generic Supabase error message.
  }

  return error?.message || 'The request failed.';
}

export async function invokeEdgeFunction<TBody extends Record<string, unknown>>(
  name: string,
  body: TBody,
) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    throw new Error(await readFunctionError(error));
  }
  return data;
}
