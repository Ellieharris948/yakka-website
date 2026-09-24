import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE'))!
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

Deno.serve(async (_req) => {
  const token = (_req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!serviceRoleKey || token !== serviceRoleKey) {
    return new Response('Not authorised', { status: 401 })
  }

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('status','seller_done')
    .lte('auto_release_at', new Date().toISOString());
  if (error) return new Response(error.message, { status: 500 });

  const failures: Array<{ jobId: string; status: number; error: string }> = []
  for (const j of (jobs || [])) {
    const response = await fetch(new URL('/functions/v1/payout', Deno.env.get('SUPABASE_URL')!).toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId: j.id })
    })
    if (!response.ok) {
      failures.push({
        jobId: j.id,
        status: response.status,
        error: (await response.text()).slice(0, 500),
      })
    }
  }

  if (failures.length) {
    return Response.json({ checked: jobs?.length || 0, failures }, { status: 500 })
  }
  return Response.json({ checked: jobs?.length || 0, released: jobs?.length || 0 })
})
