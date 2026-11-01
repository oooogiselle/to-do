"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { addDays, localDate } from "@tt/shared";
import { fmtDay, fmtTime, useModel, useSettings, useSync } from "@tt/client";
import { api } from "@/lib/client/api";
import { CalendarKeys } from "./calendar-keys";
import { CenterTabs } from "./center-tabs";
import { LayoutMenu } from "./layout-menu";
import { allPaneIds, visiblePanes, type PaneId } from "./layout";
import { PaneColumn } from "./pane-column";
import { Splitter } from "./splitter";
import { weekStart } from "./time";
import { useWorkspaceLayout } from "./use-workspace-layout";
import { WorkspaceDnd } from "./workspace-dnd";

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Workspace() {
  // Everything here depends on the current time, client-fetched data and this browser's
  // saved layout; skip SSR to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <WorkspaceView /> : null;
}

function WorkspaceView() {
  const { lists, tasks, settings, isLoading, error } = useModel();
  const now = useNow();
  const ws = useWorkspaceLayout(lists, !isLoading && !error);
  const { layout } = ws;

  if (!layout) {
    return (
      <div className="flex h-full flex-col">
        <Header now={now} tz={settings.timezone} ws={ws} />
        <div className="grid flex-1 place-items-center font-semibold text-muted">
          {error ? `Couldn't load your tasks: ${error.message}` : "Loading…"}
        </div>
      </div>
    );
  }

  const visible = new Set(visiblePanes(layout));
  const hasUnlisted = tasks.some((t) => t.status === "open" && !t.list_id);
  const hidden = allPaneIds(lists).filter(
    (p) => !visible.has(p) && (p !== "list:none" || hasUnlisted),
  );
  // d / w: bring up Today or Week, opening it as a tab if it's not showing.
  const show = (pane: PaneId) => {
    if (layout.center.includes(pane)) ws.setActiveCenter(pane);
    else if (!visible.has(pane)) ws.movePane(pane, "center");
  };

  return (
    <WorkspaceDnd tz={settings.timezone} onPaneDrop={ws.movePane}>
      <CalendarKeys layout={layout} onShow={show}>
        <div className="flex h-full flex-col">
          <Header now={now} tz={settings.timezone} ws={ws} />
          <ConnectBanner />
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 lg:flex-row lg:gap-0 lg:overflow-hidden">
            <PaneColumn
              zone="left"
              panes={layout.left}
              width={layout.leftWidth}
              weights={layout.weights}
              now={now}
              onResizeStack={(i, d, total) => ws.resizeStack("left", i, d, total)}
              onClose={ws.closePane}
            />
            {layout.left.length > 0 && (
              <Splitter
                orientation="vertical"
                label="Resize left column"
                onResize={(d) => ws.resizeSide("left", d)}
              />
            )}
            <CenterTabs
              panes={layout.center}
              active={layout.activeCenter}
              hidden={hidden}
              now={now}
              onSelect={ws.setActiveCenter}
              onClose={ws.closePane}
              onOpen={(p) => ws.movePane(p, "center")}
            />
            {layout.right.length > 0 && (
              <Splitter
                orientation="vertical"
                label="Resize right column"
                onResize={(d) => ws.resizeSide("right", -d)}
              />
            )}
            <PaneColumn
              zone="right"
              panes={layout.right}
              width={layout.rightWidth}
              weights={layout.weights}
              now={now}
              onResizeStack={(i, d, total) => ws.resizeStack("right", i, d, total)}
              onClose={ws.closePane}
            />
          </div>
        </div>
      </CalendarKeys>
    </WorkspaceDnd>
  );
}

function ago(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function Header({
  now,
  tz,
  ws,
}: {
  now: number;
  tz: string;
  ws: ReturnType<typeof useWorkspaceLayout>;
}) {
  const qc = useQueryClient();
  const { dataUpdatedAt } = useSync();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await api.refreshCalendars();
      await qc.invalidateQueries({ queryKey: ["events"] });
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : "Couldn't refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const today = localDate(new Date(now), tz);
  const start = weekStart(today, tz);
  const monthDay = (d: string) => fmtDay(d, tz).split(", ")[1];
  const subtitle = `Week of ${monthDay(start)} – ${monthDay(addDays(start, 6))} · Today ${fmtDay(today, tz).replace(",", "")}, ${fmtTime(now, tz)}`;

  return (
    <header className="relative z-40 flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
      <div className="min-w-0 leading-tight">
        <h1 className="text-[14px] font-extrabold tracking-tight text-ink">Workspace</h1>
        <p className="truncate text-[11px] font-bold text-[#787c94]">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        title="Refresh Google Calendar"
        className="ml-auto hidden items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-[#5b5e72] hover:bg-paper disabled:opacity-70 sm:flex"
      >
        {refreshError ? (
          <span className="text-risk">{refreshError}</span>
        ) : refreshing ? (
          <>
            <RefreshCw className="h-3 w-3 animate-spin" /> Syncing…
          </>
        ) : (
          <>
            <span className="animate-sync-pulse h-1.5 w-1.5 rounded-full bg-mint" />
            Synced {dataUpdatedAt ? ago(now - dataUpdatedAt) : "just now"}
            <RefreshCw className="h-3 w-3 opacity-50" />
          </>
        )}
      </button>
      <div className="ml-auto sm:ml-0">
        <LayoutMenu presets={ws.presets} presetId={ws.presetId} onApply={ws.applyPreset} />
      </div>
    </header>
  );
}

function ConnectBanner() {
  const { data } = useSettings();
  if (!data) return null;
  if (data.google?.needs_reconnect) {
    return (
      <p className="border-b border-sun/40 bg-warn-bg px-4 py-2 text-[13px] font-semibold text-warn">
        Google Calendar access expired, so events aren&apos;t updating.{" "}
        <a href="/api/google/connect" className="font-bold underline">
          Reconnect
        </a>
      </p>
    );
  }
  if (data.google) return null;
  return (
    <p className="border-b border-line bg-surface px-4 py-2 text-[13px] font-semibold text-muted">
      Your calendar isn&apos;t connected yet.{" "}
      <a href="/settings" className="font-bold text-ink underline">
        Connect Google Calendar
      </a>{" "}
      to see events and open time.
    </p>
  );
}
