export type JobPhotoStage = 'before' | 'progress' | 'after' | 'dispute';

export function inferJobPhotoStage(job: {
  start_date?: string | null;
  status?: string | null;
}, intent?: 'completion'): Exclude<JobPhotoStage, 'dispute'> {
  if (intent === 'completion') return 'after';
  if (!job.start_date) return 'before';
  if (job.status === 'seller_done' || job.status === 'completed') return 'after';
  return 'progress';
}
