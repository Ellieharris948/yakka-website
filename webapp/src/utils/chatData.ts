import type { JobStatus } from './statusStyles';

export type NormalizedChatJob = {
  id: string;
  ref_code: string | null;
  trader_id: string | null;
  client_id: string | null;
  status: JobStatus;
  title: string;
  description: string | null;
  price_cents: number | null;
  created_at: string | null;
  planned_start_date: string | null;
  flex_days: number | null;
  start_date: string | null;
  end_date: string | null;
  started_trader: boolean | null;
  started_client: boolean | null;
  client_final_request_sent: boolean;
  duration_days: number | null;
  scope_change_status: string | null;
};

export type NormalizedChatMessage = {
  _id: string;
  text: string;
  createdAt: Date;
  user: { _id: string | null };
};

const CHAT_JOB_STATUSES = new Set<JobStatus>([
  'proposed',
  'accepted',
  'funded',
  'in_progress',
  'seller_done',
  'client_done',
  'completed',
  'disputed',
  'cancelled',
]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function optionalString(value: unknown) {
  const result = requiredString(value);
  return result || null;
}

function optionalNumber(value: unknown) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function validDate(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Supabase rows are external input at runtime even when TypeScript knows the
 * intended schema. Normalising before rendering prevents malformed/legacy
 * rows from reaching native Text, Image and date-formatting code.
 */
export function normalizeChatJob(value: unknown, expectedId = ''): NormalizedChatJob | null {
  const row = asRecord(value);
  if (!row) return null;

  const id = requiredString(row.id) || requiredString(expectedId);
  if (!id) return null;

  const rawStatus = requiredString(row.status);
  const status = rawStatus === 'declined' ? 'cancelled' : rawStatus;
  if (!CHAT_JOB_STATUSES.has(status as JobStatus)) return null;

  return {
    id,
    ref_code: optionalString(row.ref_code),
    trader_id: optionalString(row.trader_id),
    client_id: optionalString(row.client_id),
    status: status as JobStatus,
    title: optionalString(row.title) || 'Yakka job',
    description: optionalString(row.description),
    price_cents: optionalNumber(row.price_cents),
    created_at: optionalString(row.created_at),
    planned_start_date: optionalString(row.planned_start_date),
    flex_days: optionalNumber(row.flex_days),
    start_date: optionalString(row.start_date),
    end_date: optionalString(row.end_date),
    started_trader: optionalBoolean(row.started_trader),
    started_client: optionalBoolean(row.started_client),
    client_final_request_sent: row.client_final_request_sent === true,
    duration_days: optionalNumber(row.duration_days),
    scope_change_status: optionalString(row.scope_change_status),
  };
}

export function normalizeChatMessage(value: unknown): NormalizedChatMessage | null {
  const row = asRecord(value);
  if (!row) return null;

  const id = requiredString(row.id);
  if (!id) return null;

  return {
    _id: id,
    text: row.body == null ? '' : requiredString(row.body),
    // Invalid timestamps can throw from Intl on Hermes. Epoch is stable,
    // sortable and safe to format while preserving the message itself.
    createdAt: validDate(optionalString(row.created_at)) || new Date(0),
    user: { _id: optionalString(row.sender_id) },
  };
}

/** Hermes-safe HH:mm formatting which does not depend on native Intl data. */
export function formatChatClock(value: Date | string | null | undefined) {
  const date = validDate(value);
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Hermes-safe timestamp used by the conversation list. */
export function formatChatListTime(value: Date | string | null | undefined, today = new Date()) {
  const date = validDate(value);
  const reference = validDate(today);
  if (!date || !reference) return '';
  if (
    date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate()
  ) {
    return formatChatClock(date);
  }
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`;
}
