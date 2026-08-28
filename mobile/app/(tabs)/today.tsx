import { TabScreen } from '@/components/ui/TabScreen';

export default function Screen() {
  return (
    <TabScreen
      kicker="TODAY"
      title="Today"
      sub="What is on the plan for today, pillar by pillar."
      icon="sun"
      sentence="Your day lands here."
      detail="The four pillars as drawers, the plate slot by slot, and the sessions with a door to walk through."
    />
  );
}
