import type { z } from "zod";
import type {
  ImportCommit,
  ImportCommitResult,
  SyllabusExtractionResult,
  TextExtractionResult,
} from "./import";
import type {
  Calendar,
  DayPlanItem,
  DayPlanItemCreate,
  DayPlanItemPatch,
  EventsResponse,
  List,
  ListCreate,
  ListPatch,
  Settings,
  SettingsPatch,
  AssistantChat,
  AssistantMessage,
  Step,
  StepCreate,
  StepPatch,
  SuggestRequest,
  SuggestResponse,
  SyncResponse,
  ProposedStep,
  Task,
  TaskCreate,
  TaskPatch,
  TimeBlock,
} from "./schemas";

export type SettingsResponse = {
  settings: Settings;
  google: { email: string; needs_reconnect: boolean } | null;
};
export type TaskDetail = Task & { steps: Step[]; time_blocks: TimeBlock[] };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Opts = {
  /** "" for same-origin web; the deployed URL on iOS. */
  baseUrl: string;
  /** Bearer token provider for clients without auth cookies (iOS). */
  getToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
};

export function createApiClient({ baseUrl, getToken, fetch: f = fetch }: Opts) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getToken?.();
    const res = await f(`${baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, json?.error ?? res.statusText);
    return json as T;
  }

  return {
    sync: (since?: string) =>
      call<SyncResponse>("GET", `/sync${since ? `?since=${encodeURIComponent(since)}` : ""}`),
    events: (from: Date, to: Date) =>
      call<EventsResponse>("GET", `/events?from=${from.toISOString()}&to=${to.toISOString()}`),

    createList: (body: z.infer<typeof ListCreate>) => call<List>("POST", "/lists", body),
    updateList: (id: string, body: z.infer<typeof ListPatch>) =>
      call<List>("PATCH", `/lists/${id}`, body),
    deleteList: (id: string) => call<void>("DELETE", `/lists/${id}`),

    task: (id: string) => call<TaskDetail>("GET", `/tasks/${id}`),
    createTask: (body: z.infer<typeof TaskCreate>) => call<Task>("POST", "/tasks", body),
    updateTask: (id: string, body: z.infer<typeof TaskPatch>) =>
      call<Task>("PATCH", `/tasks/${id}`, body),
    deleteTask: (id: string) => call<void>("DELETE", `/tasks/${id}`),

    createStep: (body: z.infer<typeof StepCreate>) => call<Step>("POST", "/steps", body),
    updateStep: (id: string, body: z.infer<typeof StepPatch>) =>
      call<Step>("PATCH", `/steps/${id}`, body),
    deleteStep: (id: string) => call<void>("DELETE", `/steps/${id}`),

    createDayPlanItem: (body: z.infer<typeof DayPlanItemCreate>) =>
      call<DayPlanItem>("POST", "/day-plan", body),
    updateDayPlanItem: (id: string, body: z.infer<typeof DayPlanItemPatch>) =>
      call<DayPlanItem>("PATCH", `/day-plan/${id}`, body),
    deleteDayPlanItem: (id: string) => call<void>("DELETE", `/day-plan/${id}`),

    settings: () => call<SettingsResponse>("GET", "/settings"),
    updateSettings: (body: z.infer<typeof SettingsPatch>) =>
      call<Settings>("PATCH", "/settings", body),
    /** Permanently deletes the account and all data, and disconnects Google Calendar. */
    deleteAccount: () =>
      call<{ warnings: string[] }>("DELETE", "/account", { confirm: true }),

    calendars: () => call<Calendar[]>("GET", "/calendars"),
    setCalendarSelected: (id: string, selected: boolean) =>
      call<Calendar>("PATCH", `/calendars/${encodeURIComponent(id)}`, { selected }),
    refreshCalendars: () => call<{ ok: true; synced: number }>("POST", "/calendars/refresh"),

    createTimeBlock: (body: {
      task_id: string;
      step_id?: string | null;
      start: string;
      end: string;
    }) => call<TimeBlock>("POST", "/time-blocks", body),
    moveTimeBlock: (id: string, body: { start: string; end: string }) =>
      call<TimeBlock>("PATCH", `/time-blocks/${id}`, body),
    /** Ends a running block early; unlike a move, the new end may already be past. */
    trimTimeBlock: (id: string, body: { end: string }) =>
      call<TimeBlock>("POST", `/time-blocks/${id}/trim`, body),
    deleteTimeBlock: (id: string) => call<void>("DELETE", `/time-blocks/${id}`),
    removeUpcomingBlocks: (body: { task_id: string; step_id?: string }) =>
      call<{ removed: number }>("DELETE", "/time-blocks/upcoming", body),

    breakdown: (taskId: string, mode: "default" | "more_detailed" = "default") =>
      call<{ steps: ProposedStep[] }>("POST", `/tasks/${taskId}/breakdown`, { mode }),
    /** Starts web research for a someday item; returns the task marked pending. */
    research: (taskId: string) => call<Task>("POST", `/tasks/${taskId}/research`, {}),
    /** Ask tt. chats, most recent first. */
    assistantChats: () => call<AssistantChat[]>("GET", "/assistant/chats"),
    /** One Ask tt. chat's messages, oldest first. */
    assistant: (chatId: string) =>
      call<AssistantMessage[]>("GET", `/assistant?chat_id=${encodeURIComponent(chatId)}`),
    /**
     * Sends a message to a chat, or starts a new one when `chatId` is null. Returns the message
     * and the pending reply (both carry the chat's id); the reply fills in through realtime.
     */
    sendAssistant: (text: string, opts: { chatId: string | null; focusTaskId?: string | null }) =>
      call<AssistantMessage[]>("POST", "/assistant", {
        text,
        chat_id: opts.chatId,
        focus_task_id: opts.focusTaskId ?? null,
      }),
    /** Asks again for a chat's last reply, when it failed. Returns the new pending reply. */
    retryAssistant: (chatId: string) =>
      call<AssistantMessage[]>("POST", "/assistant", { retry: true, chat_id: chatId }),
    /** Marks card actions as done, so the cards stay resolved. */
    resolveAssistantCard: (messageId: string, entries: Record<string, string>) =>
      call<AssistantMessage>("PATCH", `/assistant/${messageId}`, { entries }),
    renameAssistantChat: (chatId: string, title: string) =>
      call<AssistantChat>("PATCH", `/assistant/chats/${chatId}`, { title }),
    deleteAssistantChat: (chatId: string) => call<void>("DELETE", `/assistant/chats/${chatId}`),
    suggest: (body: SuggestRequest) => call<SuggestResponse>("POST", "/suggest", body),
    extractText: (text: string) =>
      call<TextExtractionResult>("POST", "/imports/extract-text", { text }),
    extractSyllabus: (body: { text: string } | { storage_path: string; file_name?: string }) =>
      call<SyllabusExtractionResult>("POST", "/imports/extract-syllabus", body),
    commitImport: (body: ImportCommit) => call<ImportCommitResult>("POST", "/imports/commit", body),

    replaceSteps: (taskId: string, steps: ProposedStep[]) =>
      call<{ task: Task; steps: Step[] }>("PUT", `/tasks/${taskId}/steps`, { steps }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
