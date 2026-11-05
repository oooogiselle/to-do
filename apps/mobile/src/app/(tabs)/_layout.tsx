import { NativeTabs } from "expo-router/native-tabs";

export default function TabsLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar.day.timeline.left" md="view_timeline" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="due">
        <NativeTabs.Trigger.Label>Due</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.badge.exclamationmark" md="schedule" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="to-dos">
        <NativeTabs.Trigger.Label>To-dos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="someday">
        <NativeTabs.Trigger.Label>Someday</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
