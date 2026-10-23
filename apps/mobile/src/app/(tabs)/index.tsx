import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { addDays, localDate } from "@tt/shared";
import { fmtDay, useModel } from "@tt/client";
import { ConnectBanner, NoticeBanner } from "@/components/banners";
import { DayTimeline } from "@/components/day-timeline";
import { IconButton } from "@/components/icon-button";
import { ScreenHeader } from "@/components/screen-header";
import { useNow } from "@/hooks/use-now";

export default function Today() {
  const { settings } = useModel();
  const now = useNow();
  const tz = settings.timezone;
  const today = localDate(new Date(now), tz);
  // null follows today, so the view rolls over at midnight.
  const [anchor, setAnchor] = useState<string | null>(null);
  const day = anchor ?? today;
  const openTask = (id: string) => router.push({ pathname: "/task/[id]", params: { id } });

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={day === today ? `Today, ${fmtDay(day, tz)}` : fmtDay(day, tz, "long")}
        right={
          <>
            <IconButton
              label="Previous day"
              glyph="‹"
              onPress={() => setAnchor(addDays(day, -1))}
            />
            {day !== today && (
              <IconButton label="Go to today" glyph="Today" onPress={() => setAnchor(null)} />
            )}
            <IconButton label="Next day" glyph="›" onPress={() => setAnchor(addDays(day, 1))} />
            <IconButton label="Add task" glyph="+" filled onPress={() => router.push("/add")} />
          </>
        }
      />
      <ConnectBanner />
      <DayTimeline day={day} isToday={day === today} now={now} onOpenTask={openTask} />
      <NoticeBanner />
    </View>
  );
}
