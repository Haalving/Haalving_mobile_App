import { PendingPage } from '@/components/shell/PendingPage';

export default function Page() {
  return (
    <PendingPage
      kicker="THE WEEK"
      title="Schedule"
      sub="The team's working calendar — sessions, duties and the meetings between them."
      icon="cal"
      sentence="The grid lands here."
      detail="Nothing may put a person in a slot without asking the conflict engine first; that engine is already ported and tested."
    />
  );
}
