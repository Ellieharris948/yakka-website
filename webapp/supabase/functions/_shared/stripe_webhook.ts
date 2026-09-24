export function shouldAttemptAutomaticRelease(input: {
  jobStatus?: string | null;
  paymentStatus?: string | null;
  stripeTransferId?: string | null;
}) {
  const jobReady = ['client_done', 'completed'].includes(String(input.jobStatus || ''));
  const paymentReady = ['funded', 'released'].includes(String(input.paymentStatus || ''));
  return jobReady && paymentReady && !String(input.stripeTransferId || '').trim();
}
