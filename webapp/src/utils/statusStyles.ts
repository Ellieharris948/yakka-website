export type JobStatus =
  | 'proposed'
  | 'accepted'
  | 'funded'
  | 'in_progress'
  | 'seller_done'
  | 'client_done'
  | 'completed'
  | 'disputed'
  | 'cancelled';

export type StatusMeta = {
  bannerLabel: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
};

type StatusTone =
  | 'progress'
  | 'attention'
  | 'pending'
  | 'pendingSoft'
  | 'success'
  | 'successSoft'
  | 'disputed'
  | 'cancelled';

type StatusColors = Omit<StatusMeta, 'bannerLabel'>;

const LIGHT_STATUS_PALETTE: Record<StatusTone, StatusColors> = {
  progress: { backgroundColor: '#efe3dc', textColor: '#581a1f', borderColor: '#c9a497' },
  attention: { backgroundColor: '#ffe6d9', textColor: '#581a1f', borderColor: '#fe8a55' },
  pending: { backgroundColor: '#f7eee6', textColor: '#581a1f', borderColor: '#d8b7a6' },
  pendingSoft: { backgroundColor: '#f4f0ea', textColor: '#6a292e', borderColor: '#d8cdc2' },
  success: { backgroundColor: '#e5eee5', textColor: '#31533d', borderColor: '#98b39c' },
  successSoft: { backgroundColor: '#edf2ea', textColor: '#3f5944', borderColor: '#b9cbb9' },
  disputed: { backgroundColor: '#581a1f', textColor: '#fff8ed', borderColor: '#8e4a52' },
  cancelled: { backgroundColor: '#e9e2d7', textColor: '#581a1f', borderColor: '#c7beaf' },
};

// Dark mode uses restrained, deeper surfaces instead of bright pastel status blocks.
const DARK_STATUS_PALETTE: Record<StatusTone, StatusColors> = {
  progress: { backgroundColor: '#51383b', textColor: '#f4f4ec', borderColor: '#9a7770' },
  attention: { backgroundColor: '#673529', textColor: '#f4f4ec', borderColor: '#d06f48' },
  pending: { backgroundColor: '#4d3738', textColor: '#f4f4ec', borderColor: '#9c7770' },
  pendingSoft: { backgroundColor: '#453335', textColor: '#f4f4ec', borderColor: '#806267' },
  success: { backgroundColor: '#35483b', textColor: '#f4f4ec', borderColor: '#718b78' },
  successSoft: { backgroundColor: '#3a453d', textColor: '#f4f4ec', borderColor: '#718078' },
  disputed: { backgroundColor: '#68222b', textColor: '#fff0f2', borderColor: '#b65c67' },
  cancelled: { backgroundColor: '#493438', textColor: '#f3e8e4', borderColor: '#806267' },
};

function statusMeta(label: string, tone: StatusTone, dark: boolean): StatusMeta {

  return { bannerLabel: label, ...(dark ? DARK_STATUS_PALETTE : LIGHT_STATUS_PALETTE)[tone] };
}

export function getCustomerStatusMeta(
  job: { status: JobStatus; scope_change_status?: string | null; price_cents?: number | null },
  dark = false,
): StatusMeta {
  if (job.scope_change_status && ['funded', 'in_progress'].includes(job.status)) return statusMeta(
    job.scope_change_status === 'proposed' ? 'Status: Extra Work Awaiting Approval' : 'Status: Awaiting Additional Payment', 'pending', dark);


  if (job.status === 'proposed') {
    return Number(job.price_cents || 0) > 0
      ? statusMeta('Status: Awaiting Your Payment', 'pending', dark)
      : statusMeta('Status: Awaiting Tradie Details', 'pendingSoft', dark);
  }

  if (job.status === 'accepted') {
    return statusMeta('Status: Awaiting Your Payment', 'pending', dark);
  }

  switch (job.status) {
    case 'funded':
    case 'in_progress':
      return statusMeta('Status: Payment Received - Work in Progress', 'progress', dark);
    case 'seller_done':
      return statusMeta('Status: Tradie Marked Complete - Awaiting Your Approval', 'attention', dark);
    case 'client_done':
      return statusMeta('Status: Payment Processing', 'successSoft', dark);
    case 'completed':
      return statusMeta('Status: Payment Released - Job Complete', 'success', dark);
    case 'disputed':
      return statusMeta('Status: Under Review by YAKKA', 'disputed', dark);
    case 'cancelled':
      return statusMeta('Status: Cancelled', 'cancelled', dark);
  }
}

export function getTraderStatusMeta(
  job: { status: JobStatus; scope_change_status?: string | null; price_cents?: number | null; client_id?: string | null },
  dark = false,
): StatusMeta {
  if (job.scope_change_status && ['funded', 'in_progress'].includes(job.status)) return statusMeta(
    job.scope_change_status === 'proposed' ? 'Status: Extra Work Awaiting Approval' : 'Status: Awaiting Additional Payment', 'pending', dark);


  if (job.status === 'proposed') {
    return !!job.client_id && Number(job.price_cents || 0) <= 0
      ? statusMeta('Status: Awaiting Job Breakdown', 'pendingSoft', dark)
      : statusMeta('Status: Waiting for Customer Payment', 'pending', dark);
  }

  if (job.status === 'accepted') {
    return statusMeta('Status: Waiting for Customer Payment', 'pending', dark);
  }

  switch (job.status) {
    case 'funded':
    case 'in_progress':
      return statusMeta('Status: Payment Received - Safe to Start', 'progress', dark);
    case 'seller_done':
      return statusMeta('Status: Marked Complete - Awaiting Customer', 'attention', dark);
    case 'client_done':
      return statusMeta('Status: Awaiting Payout from YAKKA', 'successSoft', dark);
    case 'completed':
      return statusMeta('Status: Payment Released - Job Complete', 'success', dark);
    case 'disputed':
      return statusMeta('Status: Under Review by YAKKA', 'disputed', dark);
    case 'cancelled':
      return statusMeta('Status: Cancelled', 'cancelled', dark);
  }
}

export function getJobStatusMeta(
  job: { status: JobStatus; scope_change_status?: string | null; price_cents?: number | null; client_id?: string | null },
  viewerRole: 'client' | 'trader',
  options: { dark?: boolean; partialPaymentStatus?: string | null } = {},
): StatusMeta {

  const dark = options.dark ?? false;
  if (options.partialPaymentStatus === 'requested') {
    return statusMeta('Status: Partial Payment Requested', 'attention', dark);
  }
  if (options.partialPaymentStatus === 'approved' || options.partialPaymentStatus === 'released') {
    return statusMeta('Status: Partially Paid - Work in Progress', 'progress', dark);
  }
  return viewerRole === 'trader' ? getTraderStatusMeta(job, dark) : getCustomerStatusMeta(job, dark);
}
