import { PendingPage } from '@/components/shell/PendingPage';

export default function Page() {
  return (
    <PendingPage
      kicker="YOUR DESK"
      title="Work Queues"
      sub="Approvals, the meal queue, medical review and the chart builder — everything waiting on you."
      icon="clock"
      sentence="The four boards land here."
      detail="Approvals with their signature chain, the dietitian's meal queue with its SLA countdown, medical review, and the chart builder."
    />
  );
}
