/** Resume a quote save after a lost response without duplicating its lines. */
export async function ensureQuoteRows(client: any, table: 'job_items' | 'job_materials', jobId: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const { data, error } = await client.from(table).select('*').eq('job_id', jobId);
  if (error) throw error;
  if (data?.length) {
    const keys = Object.keys(rows[0]).sort();
    const canonical = (row: any) => JSON.stringify(keys.map(key => row[key] ?? null));
    const expected = rows.map(canonical).sort();
    const saved = data.map(canonical).sort();
    if (JSON.stringify(expected) !== JSON.stringify(saved)) {
      throw new Error('The saved quote differs from this draft. Open the saved job to review its breakdown before sharing.');
    }
    return;
  }
  const result = await client.from(table).insert(rows);
  if (result.error) throw result.error;
}
