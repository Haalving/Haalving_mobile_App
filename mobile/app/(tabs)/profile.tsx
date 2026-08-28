import { TabScreen } from '@/components/ui/TabScreen';

export default function Screen() {
  return (
    <TabScreen
      kicker="YOU"
      title="Profile"
      sub="Your record, your plan and your settings."
      icon="user"
      sentence="Your profile lands here."
      detail="Your details, your Vital Panel and what the app may notify you about."
    />
  );
}
