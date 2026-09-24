import React from 'react';
import Payment from './Payment';
import PaymentReceived from './PaymentReceived';

export default function PaymentCancelled(props: any) {
  // An extra-work checkout belongs to its own payment, even on the same job.
  return props.route?.params?.scopeChangeId
    ? <PaymentReceived {...props} />
    : <Payment {...props} />;
}
