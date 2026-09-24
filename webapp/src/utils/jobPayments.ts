type JobLike = {
  price_cents?: number | null;
  description?: string | null;
  upfront_materials_cents?: number | null;
  materials_cents?: number | null;
  vat_registered?: boolean | null;
  vat_rate_bps?: number | null;
};

type JobItemLike = {
  qty?: number | null;
  price_cents?: number | null;
};

export type JobPaymentBreakdown = {
  laborCents: number;
  materialsCents: number;
  upfrontMaterialsCents: number;
  subtotalExVatCents: number;
  vatCents: number;
  vatRateBps: number;
  tradieGrossCents: number;
  sellerFeeCents: number;
  netToSellerCents: number;
  clientFeeCents: number;
  totalDueCents: number;
};

export const YAKKA_TRADIE_FEE_BPS = 500;
export const YAKKA_CUSTOMER_FEE_BPS = 200;
export const DEFAULT_VAT_RATE_BPS = 2_000;

const UPFRONT_MATERIALS_RE =
  /upfront materials requested:\s*[£$]?([\d,]+(?:\.\d{1,2})?)/i;

function toPositiveInt(value: unknown) {
  const amount = Math.round(Number(value ?? 0));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function parseMoneyTextToCents(value: string) {
  const clean = String(value || "").replace(/[^\d.]/g, "");
  if (!clean || !/^\d+(?:\.\d{1,2})?$/.test(clean)) return 0;
  const [pounds, decimals = ""] = clean.split(".");
  return Number(pounds) * 100 + Number((decimals + "00").slice(0, 2));
}

export function resolveUpfrontMaterialsCents(job: JobLike | null | undefined) {
  if (!job) return 0;

  const explicit = toPositiveInt(job.upfront_materials_cents);
  if (explicit > 0) return explicit;

  const match = String(job.description || "").match(UPFRONT_MATERIALS_RE);
  return match?.[1] ? parseMoneyTextToCents(match[1]) : 0;
}

export function sumJobItemsCents(items: JobItemLike[] | null | undefined) {
  if (!items?.length) return 0;
  return items.reduce((sum, item) => {
    const qty = Math.max(1, Math.round(Number(item.qty ?? 1) || 1));
    const unit = Math.max(0, Math.round(Number(item.price_cents ?? 0) || 0));
    return sum + qty * unit;
  }, 0);
}

export function buildPaymentBreakdown(args: {
  laborCents: number;
  materialsCents?: number;
  upfrontMaterialsCents?: number;
  vatRegistered?: boolean;
  vatRateBps?: number;
}) {
  const laborCents = Math.max(0, toPositiveInt(args.laborCents));
  const upfrontMaterialsCents = Math.max(
    0,
    toPositiveInt(args.upfrontMaterialsCents),
  );
  const materialsCents = Math.max(
    upfrontMaterialsCents,
    toPositiveInt(args.materialsCents),
  );
  const subtotalExVatCents = laborCents + materialsCents;
  const vatRateBps = args.vatRegistered
    ? Math.min(10_000, toPositiveInt(args.vatRateBps ?? DEFAULT_VAT_RATE_BPS))
    : 0;
  const vatCents = Math.round((subtotalExVatCents * vatRateBps) / 10_000);
  const tradieGrossCents = subtotalExVatCents + vatCents;
  const sellerFeeCents = Math.ceil((tradieGrossCents * YAKKA_TRADIE_FEE_BPS) / 10_000);
  const netToSellerCents = Math.max(0, tradieGrossCents - sellerFeeCents);
  const clientFeeCents = Math.ceil((tradieGrossCents * YAKKA_CUSTOMER_FEE_BPS) / 10_000);

  return {
    laborCents,
    materialsCents,
    upfrontMaterialsCents,
    subtotalExVatCents,
    vatCents,
    vatRateBps,
    tradieGrossCents,
    sellerFeeCents,
    netToSellerCents,
    clientFeeCents,
    totalDueCents: tradieGrossCents + clientFeeCents,
  } satisfies JobPaymentBreakdown;
}

export function buildJobPaymentBreakdown(
  job: JobLike | null | undefined,
  items?: JobItemLike[] | null,
) {
  const itemTotal = sumJobItemsCents(items);
  const laborCents = itemTotal > 0 ? itemTotal : toPositiveInt(job?.price_cents);
  const upfrontMaterialsCents = resolveUpfrontMaterialsCents(job);
  const materialsCents = Math.max(upfrontMaterialsCents, toPositiveInt(job?.materials_cents));

  return buildPaymentBreakdown({
    laborCents,
    materialsCents,
    upfrontMaterialsCents,
    vatRegistered: job?.vat_registered === true,
    vatRateBps: job?.vat_rate_bps ?? DEFAULT_VAT_RATE_BPS,
  });
}

export function buildPartialReleaseBreakdown(args: {
  requestedCents: number;
  feeBps?: number;
}) {
  const requestedCents = toPositiveInt(args.requestedCents);
  const feeBps = Math.min(10_000, toPositiveInt(args.feeBps ?? YAKKA_TRADIE_FEE_BPS));
  const feeWithheldCents = Math.ceil((requestedCents * feeBps) / 10_000);
  const transferCents = Math.max(0, requestedCents - feeWithheldCents);

  return {
    requestedCents,
    transferCents,
    feeWithheldCents,
  };
}

export function buildDisputeResolutionBreakdown(args: {
  principalCents: number;
  clientFeeCents: number;
  previouslyReleasedGrossCents?: number;
  customerGrossCents: number;
  tradieGrossCents: number;
}) {
  const principalCents = toPositiveInt(args.principalCents);
  const clientFeeCents = toPositiveInt(args.clientFeeCents);
  const previouslyReleasedGrossCents = Math.min(
    principalCents,
    toPositiveInt(args.previouslyReleasedGrossCents),
  );
  const remainingPrincipalCents = Math.max(0, principalCents - previouslyReleasedGrossCents);
  const customerGrossCents = toPositiveInt(args.customerGrossCents);
  const tradieGrossCents = toPositiveInt(args.tradieGrossCents);
  const allocatedCents = customerGrossCents + tradieGrossCents;
  const unallocatedCents = remainingPrincipalCents - allocatedCents;
  const clientFeeRefundCents = principalCents > 0
    ? Math.round((clientFeeCents * customerGrossCents) / principalCents)
    : 0;
  const tradieFeeCents = Math.ceil((tradieGrossCents * YAKKA_TRADIE_FEE_BPS) / 10_000);

  return {
    remainingPrincipalCents,
    customerGrossCents,
    clientFeeRefundCents,
    customerRefundCents: customerGrossCents + clientFeeRefundCents,
    tradieGrossCents,
    tradieFeeCents,
    tradieTransferCents: Math.max(0, tradieGrossCents - tradieFeeCents),
    unallocatedCents,
    isFullyAllocated: unallocatedCents === 0,
  };
}
