import { supabase } from '../lib/supabase';

export async function submitReview(params: {
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  stars: number;      // allow halves, e.g. 4.5
  comment?: string;   // optional
}) {
  const { jobId, reviewerId, revieweeId, stars, comment } = params;

  // stars should be 1.0..5.0 in 0.5 steps (DB enforces too)
  const { error } = await supabase.from('reviews').insert({
    job_id: jobId,
    reviewer_id: reviewerId,
    reviewee_id: revieweeId,
    stars,
    comment: comment ?? null,
    // hidden defaults to true; will auto-unhide when counterpart arrives
  });

  if (error) throw error;
}
