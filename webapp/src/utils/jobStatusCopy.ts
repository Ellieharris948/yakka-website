import { JobStatus } from './statusStyles';

export type ViewerRole = 'client' | 'trader';

type JobStatusCopy = {
  what: string;
  tip?: string;
};

type JobForStatusCopy = {
  status: JobStatus;
  scope_change_status?: string | null;
  client_id?: string | null;
  price_cents?: number | null;
};

export function getJobStatusCopy(job: JobForStatusCopy, viewerRole: ViewerRole): JobStatusCopy {
  if (job.scope_change_status && ['funded', 'in_progress'].includes(job.status)) return { what: job.scope_change_status === 'proposed' ? 'Extra work is awaiting customer review. Open the job to approve or decline the added lines.' : 'Extra work is approved and awaiting additional payment. Work resumes once the bank payment is confirmed.' };
  const isTrader = viewerRole === 'trader';

  switch (job.status) {
    case 'proposed':
      if (isTrader) {
        if (!!job.client_id && Number(job.price_cents || 0) <= 0) {
          return {
            what: 'The customer has requested the job. Add the task breakdown and pricing before they can approve and pay.',
            tip: 'Be specific with every line item so the full agreement is protected in YAKKA.',
          };
        }

        return {
          what: 'The customer hasn’t paid yet. Funds will appear as “Received” once YAKKA confirms payment.',
          tip: 'You can resend or copy your job link if they need it again.',
        };
      }

      if (Number(job.price_cents || 0) > 0) {
        return {
          what: 'Your tradie has submitted the job breakdown. Please review the details and make payment to secure the booking.',
          tip: 'If you need to check anything, you can message your tradie before paying.',
        };
      }

      return {
        what: 'The job has been sent to your tradie. They need to add the job details and pricing before you can approve and pay.',
        tip: 'You can copy or resend the job link anytime as a reminder.',
      };

    case 'accepted':
      return isTrader
        ? {
            what: 'The customer hasn’t paid yet. Funds will appear as “Received” once YAKKA confirms payment.',
            tip: 'You can resend or copy your job link if they need it again.',
          }
        : {
            what: 'The job is accepted. The next step is payment to secure the booking.',
            tip: 'Your money stays protected until the job is confirmed complete.',
          };

    case 'funded':
      return isTrader
        ? {
            what: 'The customer has paid in full. Funds are now held securely by YAKKA until the job is complete.',
            tip: 'Feel secure: You can start work knowing payment is guaranteed once both sides confirm completion.',
          }
        : {
            what: 'Your payment has been received and is now held securely by YAKKA until the job is complete. Your tradie can now begin work.',
            tip: 'You can upload photos or notes in the Job Messages section.',
          };

    case 'in_progress':
      return isTrader
        ? {
            what: 'The customer has paid in full. Funds are now held securely by YAKKA until the job is complete.',
            tip: 'Feel secure: You can start work knowing payment is guaranteed once both sides confirm completion.',
          }
        : {
            what: 'Your payment has been received and is now held securely by YAKKA until the job is complete. Your tradie can now begin work.',
            tip: 'You can upload photos or notes in the Job Messages section.',
          };

    case 'seller_done':
      return isTrader
        ? {
            what: 'You’ve marked the job complete. The customer is now reviewing your work before confirming release of funds.',
            tip: 'Customers have a short review period to confirm or raise a concern. You’ll be notified when they respond.',
          }
        : {
            what: 'Your tradie has marked the job as complete. Please review the work and confirm completion, or raise an issue if something is not right or completed and we will review and resolve.',
            tip: 'Make sure you capture photos if you need to raise a dispute.',
          };

    case 'client_done':
      return isTrader
        ? {
            what: 'The job has been confirmed complete. YAKKA is processing your payout.',
            tip: 'This usually takes 1–2 business days depending on your bank.',
          }
        : {
            what: 'You have confirmed the job is complete. YAKKA is now processing the final payment to the tradie.',
            tip: 'You can view full payment details any time on this job page.',
          };

    case 'completed':
      return isTrader
        ? {
            what: 'Funds have been released and sent to your bank account.',
            tip: 'You can download your invoice or view full payment details anytime from this job’s page.',
          }
        : {
            what: 'The job is now fully complete and payment has been released to your tradie. This job will now appear in your Past Jobs.',
            tip: 'You can download your invoice or view job details any time.',
          };

    case 'disputed':
      return isTrader
        ? {
            what: 'The customer has raised a dispute about part or all of this job. YAKKA’s team is reviewing the details.',
            tip: 'You can upload photos or notes in the Job Messages section to support your case.',
          }
        : {
            what: 'You have raised a dispute for this job. YAKKA is reviewing the evidence you submitted. The payment will remain on hold until the review is complete.',
            tip: 'YAKKA will compare both sides against the agreed job breakdown and update you once the review is complete.',
          };

    case 'cancelled':
      return isTrader
        ? {
            what: 'This job was cancelled or declined.',
            tip: 'You can revise the breakdown or create a new job if the customer wants to continue later.',
          }
        : {
            what: 'This job was cancelled or declined.',
            tip: 'You can create a new job or request a new proposal.',
          };

    default:
      return {
        what: 'Open the job to review the latest details.',
      };
  }
}
