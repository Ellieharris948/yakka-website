type ViewerRole = 'client' | 'trader';

type JobLike = {
  status: string;
  planned_start_date?: string | null;
  flex_days?: number | null;
  start_date?: string | null;
};

function canonicalDate(value: Date | string) {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isUnstartedJobPastStartWindow(
  job: JobLike,
  referenceDate: Date | string = new Date(),
) {
  if (job.start_date || !job.planned_start_date) return false;
  const plannedDate = canonicalDate(job.planned_start_date);
  const today = canonicalDate(referenceDate);
  if (!plannedDate || !today) return false;

  const rawFlexDays = Number(job.flex_days || 0);
  const flexDays = Number.isFinite(rawFlexDays) ? Math.max(0, Math.floor(rawFlexDays)) : 0;
  return today > addCalendarDays(plannedDate, flexDays);
}

export function isPastJobForViewer(
  job: JobLike,
  viewerRole: ViewerRole,
  referenceDate: Date | string = new Date(),
) {
  if (job.status === 'cancelled' || job.status === 'completed') return true;
  if (isUnstartedJobPastStartWindow(job, referenceDate)) return true;
  return viewerRole === 'client' && job.status === 'client_done';
}

export function isLiveJobForViewer(job: JobLike, viewerRole: ViewerRole, referenceDate: Date | string = new Date()) {
  return !isPastJobForViewer(job, viewerRole, referenceDate);
}
