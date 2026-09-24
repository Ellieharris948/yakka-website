import type { JobStatus } from './statusStyles';

export type JobProgressStepState = 'complete' | 'current' | 'upcoming';

export type JobProgressStep = {
  key: string;
  label: string;
  state: JobProgressStepState;
};

const BASE_STEPS = [
  { key: 'proposal', label: 'Proposal' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'paid', label: 'Paid' },
  { key: 'started', label: 'In progress' },
  { key: 'complete', label: 'Done' },
] as const;

const STATUS_INDEX: Record<JobStatus, number> = {
  proposed: 0,
  accepted: 1,
  funded: 2,
  in_progress: 3,
  seller_done: 4,
  client_done: 4,
  completed: 4,
  disputed: 4,
  cancelled: 1,
};

/**
 * One status vocabulary for the compact rails used in messages and job views.
 * Exceptional states keep the history visible while making the current state
 * explicit rather than suggesting that the job progressed normally.
 */
export function getJobProgressSteps(status: JobStatus): JobProgressStep[] {
  const currentIndex = STATUS_INDEX[status] ?? 0;

  return BASE_STEPS.map((step, index) => {
    let label: string = step.label;
    if ((status === 'seller_done' || status === 'client_done') && index === currentIndex) label = 'Sign-off';
    if (status === 'disputed' && index === currentIndex) label = 'Disputed';
    if (status === 'cancelled' && index === currentIndex) label = 'Cancelled';

    return {
      key: step.key,
      label,
      state: index < currentIndex
        ? 'complete'
        : index === currentIndex
          ? 'current'
          : 'upcoming',
    };
  });
}
