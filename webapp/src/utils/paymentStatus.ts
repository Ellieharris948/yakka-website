export type PaymentStatusView = {
  title: string;
  description: string;
  confirmed: boolean;
  pending: boolean;
  canRetry: boolean;
};

/** A return from the bank is not proof of payment: only the saved payment state is. */
export function getPaymentStatusView(status?: string | null): PaymentStatusView {
  switch (status) {
    case 'funded':
      return { title: 'Payment received', description: 'Your bank payment is confirmed. Funds are held for this job, and your tradie can start on the agreed date.', confirmed: true, pending: false, canRetry: false };
    case 'released':
      return { title: 'Payment released', description: 'Payment has been released to your tradie’s Stripe account. Arrival in their bank account follows Stripe’s payout schedule.', confirmed: true, pending: false, canRetry: false };
    case 'disputed':
      return { title: 'Payment under review', description: 'A concern has been raised about this job. Check your job details and messages for the next steps.', confirmed: true, pending: false, canRetry: false };
    case 'refund_pending':
      return { title: 'Refund processing', description: 'Your refund has been requested. The payment summary will update when the bank confirms it.', confirmed: true, pending: false, canRetry: false };
    case 'partially_refunded':
      return { title: 'Partially refunded', description: 'Part of this payment has been refunded. View the job details for the agreed outcome.', confirmed: true, pending: false, canRetry: false };
    case 'refunded':
      return { title: 'Payment refunded', description: 'This payment has been refunded. Your bank determines when it appears in your account.', confirmed: true, pending: false, canRetry: false };
    case 'failed':
    case 'cancelled':
      return { title: 'Payment not completed', description: 'This payment attempt was not completed. You can return to checkout to try again.', confirmed: false, pending: false, canRetry: true };
    case 'awaiting_funding':
      return { title: 'Waiting for bank confirmation', description: 'If you have authorised the payment, there is nothing else to pay. We will update this job when your bank confirms it.', confirmed: false, pending: true, canRetry: false };
    default:
      return { title: 'Payment not confirmed', description: 'We have not confirmed a payment for this job yet. Check the status before starting another payment.', confirmed: false, pending: true, canRetry: false };
  }
}
