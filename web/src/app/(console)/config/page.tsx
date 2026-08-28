import { PendingPage } from '@/components/shell/PendingPage';

export default function Page() {
  return (
    <PendingPage
      kicker="THE RULES"
      title="Configuration"
      sub="The programme's shape, the SLA ladder, notification rules, and what each role may see."
      icon="gear"
      sentence="Configuration lands here."
      detail="The RBAC matrix is already editable data — this is the screen that edits it."
    />
  );
}
