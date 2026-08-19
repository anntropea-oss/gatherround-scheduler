"use client";

import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  Check,
  Clipboard,
  Download,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  Repeat,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Availability = "yes" | "maybe" | "no";
type PollType = "specific" | "weekly";
type HomeMode = "start" | "create" | "organizer" | "respond";

type PollOption = {
  id: string;
  startsAt: string;
  label: string;
  sortOrder: number;
};

type PollResponse = {
  id: string;
  name: string;
  email: string;
  note: string;
  slots: Array<{ optionId: string; availability: Availability }>;
};

type PollPayload = {
  poll: {
    id: string;
    title: string;
    description: string;
    organizerName: string;
    timezone: string;
    pollType: PollType;
    status: string;
    selectedOptionId: string | null;
    publishNote: string;
    admin: boolean;
    adminToken?: string;
  };
  options: PollOption[];
  responses: PollResponse[];
};

type PollSummary = {
  id: string;
  title: string;
  description: string;
  organizerName: string;
  timezone: string;
  pollType: PollType;
  status: string;
  selectedOptionId: string | null;
  createdAt: string;
  updatedAt: string;
  responseCount: number;
  adminToken: string;
};

type SessionInfo = {
  signedIn: boolean;
  email: string;
  displayName: string;
  superAdmin: boolean;
};

type DraftOption = {
  id: string;
  startsAt: string;
  dayOfWeek: number;
  time: string;
  label: string;
};

type Toast = {
  tone: "good" | "bad" | "plain";
  message: string;
};

const availabilityCopy: Record<Availability, string> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

const availabilityScore: Record<Availability, number> = {
  yes: 2,
  maybe: 1,
  no: 0,
};

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const organizerKeyStorage = "gatherround.organizerKey";

function readOrganizerKey() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(organizerKeyStorage);
  if (existing) {
    return existing;
  }

  const key = crypto.randomUUID();
  window.localStorage.setItem(organizerKeyStorage, key);
  return key;
}

function localInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function optionFromInput(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function nextWeeklyDate(dayOfWeek: number, time: string) {
  const [hours = "9", minutes = "00"] = time.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  const daysAhead = (dayOfWeek - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString();
}

function defaultSpecificOptions(): DraftOption[] {
  const base = new Date();
  base.setDate(base.getDate() + 2);
  base.setMinutes(0, 0, 0);

  return [9, 13, 16].map((hour, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    date.setHours(hour);
    return {
      id: crypto.randomUUID(),
      startsAt: date.toISOString(),
      dayOfWeek: date.getDay(),
      time: `${String(hour).padStart(2, "0")}:00`,
      label: index === 0 ? "Morning option" : index === 1 ? "Afternoon option" : "Late-day option",
    };
  });
}

function defaultWeeklyOptions(): DraftOption[] {
  return [
    { dayOfWeek: 1, time: "10:00", label: "Monday morning" },
    { dayOfWeek: 3, time: "13:00", label: "Wednesday lunch-ish" },
    { dayOfWeek: 4, time: "15:00", label: "Thursday afternoon" },
  ].map((option) => ({
    id: crypto.randomUUID(),
    startsAt: nextWeeklyDate(option.dayOfWeek, option.time),
    ...option,
  }));
}

function formatOption(
  option: Pick<PollOption, "startsAt" | "label">,
  timezone: string,
  pollType: PollType,
) {
  const date = new Date(option.startsAt);
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: pollType === "weekly" ? "long" : "short",
    month: pollType === "weekly" ? undefined : "short",
    day: pollType === "weekly" ? undefined : "numeric",
    timeZone: timezone,
  }).format(date);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);

  return { day, time, label: option.label };
}

async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text };
  }
}

function getErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return "Something went sideways. Try again.";
}

function readUrlState() {
  if (typeof window === "undefined") {
    return { pollId: "", admin: "" };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    pollId: params.get("poll") ?? "",
    admin: params.get("admin") ?? "",
  };
}

function parsePollId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("poll") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function rankOptions(options: PollOption[], responses: PollResponse[]) {
  return options
    .map((option) => {
      const counts = { yes: 0, maybe: 0, no: 0 };
      let score = 0;

      for (const response of responses) {
        const slot = response.slots.find((item) => item.optionId === option.id);
        const availability = slot?.availability ?? "no";
        counts[availability] += 1;
        score += availabilityScore[availability];
      }

      return { option, counts, score };
    })
    .sort((left, right) => right.score - left.score || right.counts.yes - left.counts.yes);
}

export default function SchedulerApp() {
  const initialUrlState = readUrlState();
  const [mode, setMode] = useState<HomeMode>(initialUrlState.pollId ? "respond" : "start");
  const [organizerKey] = useState(readOrganizerKey);
  const [draft, setDraft] = useState({
    title: "Strategy sync",
    description: "Pick the times that feel good, mark maybes honestly, and leave any useful constraints.",
    organizerName: "Alex",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    pollType: "specific" as PollType,
  });
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>(() => defaultSpecificOptions());
  const [pollLookup, setPollLookup] = useState("");
  const [poll, setPoll] = useState<PollPayload | null>(null);
  const [adminToken, setAdminToken] = useState(initialUrlState.admin);
  const [loadingPoll, setLoadingPoll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [replyName, setReplyName] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [replyNote, setReplyNote] = useState("");
  const [votes, setVotes] = useState<Record<string, Availability>>({});
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState("");
  const [myPolls, setMyPolls] = useState<PollSummary[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loadingMyPolls, setLoadingMyPolls] = useState(false);

  const ranked = useMemo(
    () => (poll ? rankOptions(poll.options, poll.responses) : []),
    [poll],
  );
  const top = ranked[0];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const attendeeLink = poll ? `${origin}/?poll=${poll.poll.id}` : "";
  const adminLink = poll && adminToken ? `${attendeeLink}&admin=${adminToken}` : "";
  const bestOption =
    poll?.options.find((option) => option.id === poll.poll.selectedOptionId) ?? top?.option;

  const applyPoll = useCallback((nextPoll: PollPayload) => {
    const nextRanked = rankOptions(nextPoll.options, nextPoll.responses);
    setPoll(nextPoll);
    setVotes(
      Object.fromEntries(nextPoll.options.map((option) => [option.id, "no" as Availability])),
    );
    setSelectedOptionId(nextPoll.poll.selectedOptionId ?? nextRanked[0]?.option.id ?? null);
    setPublishNote(nextPoll.poll.publishNote);
  }, []);

  const loadMyPolls = useCallback(async () => {
    if (!organizerKey) {
      return;
    }

    setLoadingMyPolls(true);
    try {
      const response = await fetch("/api/polls/mine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizerKey }),
      });
      const payload = await parseResponse(response);

      if (!response.ok) {
        setToast({ tone: "bad", message: getErrorMessage(payload) });
        return;
      }

      const result = payload as { polls: PollSummary[]; session: SessionInfo };
      setMyPolls(result.polls);
      setSession(result.session);
    } finally {
      setLoadingMyPolls(false);
    }
  }, [organizerKey]);

  const loadPoll = useCallback(async (pollId: string, admin = "") => {
    setLoadingPoll(true);
    try {
      const suffix = admin ? `?admin=${encodeURIComponent(admin)}` : "";
      const response = await fetch(`/api/polls/${encodeURIComponent(pollId)}${suffix}`);
      const payload = await parseResponse(response);

      if (!response.ok) {
        setToast({ tone: "bad", message: getErrorMessage(payload) });
        return;
      }

      applyPoll(payload as PollPayload);
      setToast(null);
    } finally {
      setLoadingPoll(false);
    }
  }, [applyPoll]);

  useEffect(() => {
    const { pollId, admin } = readUrlState();
    if (pollId) {
      const timer = window.setTimeout(() => {
        void loadPoll(pollId, admin);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [loadPoll]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMyPolls();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMyPolls]);

  function switchPollType(pollType: PollType) {
    setDraft((current) => ({ ...current, pollType }));
    setDraftOptions(pollType === "weekly" ? defaultWeeklyOptions() : defaultSpecificOptions());
  }

  async function createNewPoll() {
    setBusy(true);
    setToast(null);
    try {
      const options = draftOptions.map((option) => {
        if (draft.pollType === "weekly") {
          return {
            startsAt: nextWeeklyDate(option.dayOfWeek, option.time),
            label: option.label,
          };
        }

        return {
          startsAt: option.startsAt,
          label: option.label,
        };
      });

      const response = await fetch("/api/polls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, organizerKey, options }),
      });
      const payload = await parseResponse(response);

      if (!response.ok) {
        setToast({ tone: "bad", message: getErrorMessage(payload) });
        return;
      }

      const created = payload as PollPayload;
      const token = created.poll.adminToken ?? "";
      applyPoll(created);
      setAdminToken(token);
      window.history.replaceState(null, "", `/?poll=${created.poll.id}&admin=${token}`);
      void loadMyPolls();
      setToast({ tone: "good", message: "Poll created. Share the attendee link when you are ready." });
    } finally {
      setBusy(false);
    }
  }

  async function openOrganizerPoll(summary: PollSummary) {
    setAdminToken(summary.adminToken);
    window.history.replaceState(null, "", `/?poll=${summary.id}&admin=${summary.adminToken}`);
    await loadPoll(summary.id, summary.adminToken);
  }

  function returnToOrganizerHome() {
    setPoll(null);
    setAdminToken("");
    window.history.replaceState(null, "", "/");
    setMode("organizer");
    void loadMyPolls();
  }

  async function openPollFromLookup() {
    const pollId = parsePollId(pollLookup);
    if (!pollId) {
      setToast({ tone: "bad", message: "Paste an attendee link or poll ID first." });
      return;
    }

    window.history.replaceState(null, "", `/?poll=${pollId}`);
    setAdminToken("");
    await loadPoll(pollId);
  }

  async function submitResponse() {
    if (!poll) {
      return;
    }

    setBusy(true);
    setToast(null);
    try {
      const response = await fetch(`/api/polls/${poll.poll.id}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: replyName,
          email: replyEmail,
          note: replyNote,
          slots: poll.options.map((option) => ({
            optionId: option.id,
            availability: votes[option.id] ?? "no",
          })),
        }),
      });
      const payload = await parseResponse(response);

      if (!response.ok) {
        setToast({ tone: "bad", message: getErrorMessage(payload) });
        return;
      }

      applyPoll(payload as PollPayload);
      setReplyName("");
      setReplyEmail("");
      setReplyNote("");
      setToast({ tone: "good", message: "Availability saved. Thanks for making scheduling less weird." });
    } finally {
      setBusy(false);
    }
  }

  async function finalizeResult() {
    if (!poll || !adminToken) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/polls/${poll.poll.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adminToken,
          organizerKey,
          status: "published",
          selectedOptionId,
          publishNote,
        }),
      });
      const payload = await parseResponse(response);

      if (!response.ok) {
        setToast({ tone: "bad", message: getErrorMessage(payload) });
        return;
      }

      applyPoll(payload as PollPayload);
      setToast({ tone: "good", message: "Final time saved. The attendee link now shows the result." });
    } finally {
      setBusy(false);
    }
  }

  function addOption() {
    const last = draftOptions[draftOptions.length - 1];
    if (draft.pollType === "weekly") {
      const dayOfWeek = last ? (last.dayOfWeek + 1) % 7 : 1;
      const time = last?.time ?? "10:00";
      setDraftOptions([
        ...draftOptions,
        {
          id: crypto.randomUUID(),
          startsAt: nextWeeklyDate(dayOfWeek, time),
          dayOfWeek,
          time,
          label: "",
        },
      ]);
      return;
    }

    const date = last?.startsAt ? new Date(last.startsAt) : new Date();
    date.setDate(date.getDate() + 1);
    setDraftOptions([
      ...draftOptions,
      {
        id: crypto.randomUUID(),
        startsAt: date.toISOString(),
        dayOfWeek: date.getDay(),
        time: localInputValue(date).slice(11),
        label: "",
      },
    ]);
  }

  function updateDraftOption(id: string, value: Partial<DraftOption>) {
    setDraftOptions((options) =>
      options.map((option) => (option.id === id ? { ...option, ...value } : option)),
    );
  }

  async function copyText(text: string, message = "Copied.") {
    await navigator.clipboard.writeText(text);
    setToast({ tone: "good", message });
  }

  function summaryText(source = poll) {
    if (!source) {
      return "";
    }
    const winner =
      source.options.find((option) => option.id === source.poll.selectedOptionId) ??
      rankOptions(source.options, source.responses)[0]?.option;
    const winnerText = winner
      ? `${formatOption(winner, source.poll.timezone, source.poll.pollType).day} at ${
          formatOption(winner, source.poll.timezone, source.poll.pollType).time
        }`
      : "No winning time yet";
    return [
      `${source.poll.title}`,
      `Final time: ${winnerText}`,
      source.poll.publishNote ? `Note: ${source.poll.publishNote}` : "",
      `Poll: ${attendeeLink || `${origin}/?poll=${source.poll.id}`}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function csvText() {
    if (!poll) {
      return "";
    }
    const header = [
      "Name",
      ...poll.options.map((option) => {
        const formatted = formatOption(option, poll.poll.timezone, poll.poll.pollType);
        return `${formatted.day} ${formatted.time}`;
      }),
      "Feedback",
    ];
    const rows = poll.responses.map((response) => [
      response.name,
      ...poll.options.map((option) => {
        const slot = response.slots.find((item) => item.optionId === option.id);
        return availabilityCopy[slot?.availability ?? "no"];
      }),
      response.note,
    ]);
    return [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
  }

  function downloadCsv() {
    const blob = new Blob([csvText()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${poll?.poll.title ?? "gatherround"}-responses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loadingPoll && !poll) {
    return (
      <main className="app-shell center-stage">
        <Loader2 className="spin" aria-hidden="true" />
        <p>Opening poll...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="masthead compact" aria-label="GatherRound">
        <div>
          <p className="brand"><Sparkles size={18} aria-hidden="true" /> GatherRound</p>
          <h1>Find the best time to meet, once or every week.</h1>
        </div>
        <div className="signal-strip" aria-hidden="true">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => (
            <span key={day} style={{ "--height": `${42 + index * 14}px` } as React.CSSProperties}>
              {day}
            </span>
          ))}
        </div>
      </section>

      {toast ? <p className={`toast ${toast.tone}`}>{toast.message}</p> : null}

      {poll ? (
        <PollWorkspace
          poll={poll}
          ranked={ranked}
          bestOption={bestOption}
          attendeeLink={attendeeLink}
          adminLink={adminLink}
          adminToken={adminToken}
          returnToOrganizerHome={returnToOrganizerHome}
          replyName={replyName}
          replyEmail={replyEmail}
          replyNote={replyNote}
          votes={votes}
          selectedOptionId={selectedOptionId}
          publishNote={publishNote}
          busy={busy}
          setReplyName={setReplyName}
          setReplyEmail={setReplyEmail}
          setReplyNote={setReplyNote}
          setVotes={setVotes}
          setSelectedOptionId={setSelectedOptionId}
          setPublishNote={setPublishNote}
          submitResponse={submitResponse}
          finalizeResult={finalizeResult}
          copyText={copyText}
          summaryText={summaryText}
          downloadCsv={downloadCsv}
        />
      ) : (
        <HomeWorkspace
          mode={mode}
          setMode={setMode}
          draft={draft}
          setDraft={setDraft}
          draftOptions={draftOptions}
          myPolls={myPolls}
          session={session}
          loadingMyPolls={loadingMyPolls}
          pollLookup={pollLookup}
          setPollLookup={setPollLookup}
          switchPollType={switchPollType}
          updateDraftOption={updateDraftOption}
          addOption={addOption}
          createNewPoll={createNewPoll}
          loadMyPolls={loadMyPolls}
          openOrganizerPoll={openOrganizerPoll}
          openPollFromLookup={openPollFromLookup}
          busy={busy}
        />
      )}
    </main>
  );
}

function HomeWorkspace({
  mode,
  setMode,
  draft,
  setDraft,
  draftOptions,
  myPolls,
  session,
  loadingMyPolls,
  pollLookup,
  setPollLookup,
  switchPollType,
  updateDraftOption,
  addOption,
  createNewPoll,
  loadMyPolls,
  openOrganizerPoll,
  openPollFromLookup,
  busy,
}: {
  mode: HomeMode;
  setMode: (mode: HomeMode) => void;
  draft: {
    title: string;
    description: string;
    organizerName: string;
    timezone: string;
    pollType: PollType;
  };
  setDraft: React.Dispatch<React.SetStateAction<{
    title: string;
    description: string;
    organizerName: string;
    timezone: string;
    pollType: PollType;
  }>>;
  draftOptions: DraftOption[];
  myPolls: PollSummary[];
  session: SessionInfo | null;
  loadingMyPolls: boolean;
  pollLookup: string;
  setPollLookup: (value: string) => void;
  switchPollType: (pollType: PollType) => void;
  updateDraftOption: (id: string, value: Partial<DraftOption>) => void;
  addOption: () => void;
  createNewPoll: () => Promise<void>;
  loadMyPolls: () => Promise<void>;
  openOrganizerPoll: (summary: PollSummary) => Promise<void>;
  openPollFromLookup: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <section className="workspace home">
      <div className="choice-panel">
        <button
          className={`choice-card ${mode === "create" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("create")}
        >
          <CalendarPlus size={22} aria-hidden="true" />
          <strong>Create a scheduling poll</strong>
          <span>Pick available times, share an attendee link, and use the admin link to finalize the winner.</span>
        </button>
        <button
          className={`choice-card ${mode === "organizer" ? "active" : ""}`}
          type="button"
          onClick={() => {
            setMode("organizer");
            void loadMyPolls();
          }}
        >
          <ListChecks size={22} aria-hidden="true" />
          <strong>My organizer polls</strong>
          <span>Open and manage every poll created from this browser.</span>
        </button>
        <button
          className={`choice-card ${mode === "respond" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("respond")}
        >
          <Search size={22} aria-hidden="true" />
          <strong>Respond to a poll</strong>
          <span>Paste an attendee link or poll ID. Your response saves directly to the poll.</span>
        </button>
      </div>

      {mode === "organizer" ? (
        <div className="editor-panel single-panel organizer-panel">
          <div className="poll-title-row">
            <div>
              <p className="section-kicker"><ListChecks size={18} aria-hidden="true" /> My polls</p>
              <p className="helper-copy">
                This browser can manage polls it created. Keep admin links private as a backup for organizer access.
              </p>
            </div>
            {session?.superAdmin ? (
              <span className="status super"><ShieldCheck size={14} aria-hidden="true" /> Super admin</span>
            ) : null}
          </div>
          <button className="secondary" type="button" onClick={loadMyPolls} disabled={loadingMyPolls}>
            {loadingMyPolls ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <ListChecks size={18} aria-hidden="true" />}
            Refresh polls
          </button>
          <div className="poll-list">
            {myPolls.length ? (
              myPolls.map((summary) => (
                <button
                  className="poll-card"
                  key={summary.id}
                  type="button"
                  onClick={() => void openOrganizerPoll(summary)}
                >
                  <strong>{summary.title}</strong>
                  <span>{summary.organizerName || "Host"} · {summary.responseCount} responses · {summary.status === "published" ? "Finalized" : "Collecting"}</span>
                  {summary.description ? <small>{summary.description}</small> : null}
                </button>
              ))
            ) : (
              <p className="empty-copy">
                No organizer polls on this browser yet. Create one poll, then come back here to manage it alongside the next one.
              </p>
            )}
          </div>
        </div>
      ) : mode === "respond" ? (
        <div className="editor-panel single-panel">
          <p className="section-kicker"><Search size={18} aria-hidden="true" /> Respond</p>
          <label>
            Attendee link or poll ID
            <input
              value={pollLookup}
              onChange={(event) => setPollLookup(event.target.value)}
              placeholder="https://.../?poll=..."
            />
          </label>
          <p className="helper-copy">
            You do not need to import anything or open a GitHub issue. In the real app, responses save directly.
          </p>
          <button className="primary" type="button" onClick={openPollFromLookup} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            Open poll
          </button>
        </div>
      ) : mode === "create" ? (
        <section className="workspace creator nested">
          <div className="editor-panel">
            <div className="section-kicker"><CalendarPlus size={18} aria-hidden="true" /> New poll</div>
            <label>
              Meeting name
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                maxLength={120}
              />
            </label>
            <label>
              Context
              <textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                rows={4}
                maxLength={1200}
              />
            </label>
            <div className="two-up">
              <label>
                Host
                <input
                  value={draft.organizerName}
                  onChange={(event) => setDraft({ ...draft, organizerName: event.target.value })}
                  maxLength={120}
                />
              </label>
              <label>
                Timezone
                <input
                  value={draft.timezone}
                  onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                  maxLength={80}
                />
              </label>
            </div>
          </div>

          <div className="times-panel">
            <div className="section-kicker"><CalendarDays size={18} aria-hidden="true" /> Available times</div>
            <div className="mode-toggle" aria-label="Poll time type">
              <button
                className={draft.pollType === "specific" ? "active" : ""}
                type="button"
                onClick={() => switchPollType("specific")}
              >
                <CalendarDays size={16} aria-hidden="true" />
                Specific dates
              </button>
              <button
                className={draft.pollType === "weekly" ? "active" : ""}
                type="button"
                onClick={() => switchPollType("weekly")}
              >
                <Repeat size={16} aria-hidden="true" />
                Days of week
              </button>
            </div>
            <p className="helper-copy">
              {draft.pollType === "weekly"
                ? "Use this for recurring meetings when you care about the best weekday and time."
                : "Use this for one-off meetings when each option is a specific calendar date."}
            </p>
            <div className="option-stack">
              {draftOptions.map((option) => (
                <div className={draft.pollType === "weekly" ? "draft-option weekly" : "draft-option"} key={option.id}>
                  {draft.pollType === "weekly" ? (
                    <>
                      <select
                        value={option.dayOfWeek}
                        onChange={(event) =>
                          updateDraftOption(option.id, { dayOfWeek: Number(event.target.value) })
                        }
                        aria-label="Available weekday"
                      >
                        {weekdays.map((day, index) => (
                          <option key={day} value={index}>{day}</option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={option.time}
                        onChange={(event) => updateDraftOption(option.id, { time: event.target.value })}
                        aria-label="Available time"
                      />
                    </>
                  ) : (
                    <input
                      type="datetime-local"
                      value={localInputValue(new Date(option.startsAt))}
                      onChange={(event) =>
                        updateDraftOption(option.id, { startsAt: optionFromInput(event.target.value) })
                      }
                      aria-label="Available date and time"
                    />
                  )}
                  <input
                    value={option.label}
                    onChange={(event) => updateDraftOption(option.id, { label: event.target.value })}
                    placeholder="Optional label"
                    maxLength={120}
                    aria-label="Available time label"
                  />
                </div>
              ))}
            </div>
            <div className="action-row">
              <button className="secondary" type="button" onClick={addOption}>Add available time</button>
              <button className="primary" type="button" onClick={createNewPoll} disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <CalendarPlus size={18} aria-hidden="true" />}
                Create poll
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="editor-panel single-panel">
          <p className="section-kicker"><Sparkles size={18} aria-hidden="true" /> Start here</p>
          <p className="description">
            Create a poll when you are organizing. Respond to a poll when someone has sent you an attendee link.
          </p>
        </div>
      )}
    </section>
  );
}

function PollWorkspace({
  poll,
  ranked,
  bestOption,
  attendeeLink,
  adminLink,
  adminToken,
  returnToOrganizerHome,
  replyName,
  replyEmail,
  replyNote,
  votes,
  selectedOptionId,
  publishNote,
  busy,
  setReplyName,
  setReplyEmail,
  setReplyNote,
  setVotes,
  setSelectedOptionId,
  setPublishNote,
  submitResponse,
  finalizeResult,
  copyText,
  summaryText,
  downloadCsv,
}: {
  poll: PollPayload;
  ranked: ReturnType<typeof rankOptions>;
  bestOption: PollOption | undefined;
  attendeeLink: string;
  adminLink: string;
  adminToken: string;
  returnToOrganizerHome: () => void;
  replyName: string;
  replyEmail: string;
  replyNote: string;
  votes: Record<string, Availability>;
  selectedOptionId: string | null;
  publishNote: string;
  busy: boolean;
  setReplyName: (value: string) => void;
  setReplyEmail: (value: string) => void;
  setReplyNote: (value: string) => void;
  setVotes: React.Dispatch<React.SetStateAction<Record<string, Availability>>>;
  setSelectedOptionId: (value: string | null) => void;
  setPublishNote: (value: string) => void;
  submitResponse: () => Promise<void>;
  finalizeResult: () => Promise<void>;
  copyText: (value: string, message?: string) => Promise<void>;
  summaryText: () => string;
  downloadCsv: () => void;
}) {
  const selectedLabel = bestOption
    ? formatOption(bestOption, poll.poll.timezone, poll.poll.pollType)
    : null;
  const isAdmin = Boolean(adminToken);

  return (
    <section className="workspace poll">
      <div className="poll-main">
        <div className="poll-title-row">
          <div>
            <p className="section-kicker">
              {poll.poll.organizerName || "Host"} is gathering availability
            </p>
            <h2>{poll.poll.title}</h2>
            {poll.poll.description ? <p className="description">{poll.poll.description}</p> : null}
          </div>
          <span className={`status ${poll.poll.status}`}>
            {poll.poll.status === "published" ? "Finalized" : "Collecting"}
          </span>
        </div>

        {poll.poll.status === "published" && selectedLabel ? (
          <div className="winner-banner">
            <Trophy size={22} aria-hidden="true" />
            <div>
              <strong>{selectedLabel.day} at {selectedLabel.time}</strong>
              <span>{poll.poll.publishNote || "This is the time to rally around."}</span>
            </div>
          </div>
        ) : null}

        <div className="result-grid">
          {ranked.map(({ option, counts, score }, index) => {
            const formatted = formatOption(option, poll.poll.timezone, poll.poll.pollType);
            const maxScore = Math.max(1, (poll.responses.length || 1) * 2);
            return (
              <button
                className={`time-result ${option.id === selectedOptionId ? "selected" : ""}`}
                key={option.id}
                type="button"
                onClick={isAdmin ? () => setSelectedOptionId(option.id) : undefined}
              >
                <span className="rank">#{index + 1}</span>
                <strong>{formatted.day}</strong>
                <span>{formatted.time}</span>
                {formatted.label ? <em>{formatted.label}</em> : null}
                <i style={{ "--fill": `${Math.round((score / maxScore) * 100)}%` } as React.CSSProperties} />
                <small>{counts.yes} yes / {counts.maybe} maybe</small>
              </button>
            );
          })}
        </div>

        <div className="response-box">
          <div className="section-kicker"><Check size={18} aria-hidden="true" /> Respond</div>
          <div className="two-up">
            <label>
              Name
              <input value={replyName} onChange={(event) => setReplyName(event.target.value)} maxLength={120} />
            </label>
            <label>
              Email
              <input value={replyEmail} onChange={(event) => setReplyEmail(event.target.value)} maxLength={180} />
            </label>
          </div>
          <div className="vote-list">
            {poll.options.map((option) => {
              const formatted = formatOption(option, poll.poll.timezone, poll.poll.pollType);
              return (
                <div className="vote-row" key={option.id}>
                  <div>
                    <strong>{formatted.day}</strong>
                    <span>{formatted.time}{formatted.label ? ` - ${formatted.label}` : ""}</span>
                  </div>
                  <div className="segmented" aria-label={`${formatted.day} ${formatted.time}`}>
                    {(["yes", "maybe", "no"] as Availability[]).map((availability) => (
                      <button
                        className={votes[option.id] === availability ? "active" : ""}
                        key={availability}
                        type="button"
                        onClick={() => setVotes((current) => ({ ...current, [option.id]: availability }))}
                      >
                        {availabilityCopy[availability]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <label>
            Notes
            <textarea
              value={replyNote}
              onChange={(event) => setReplyNote(event.target.value)}
              rows={3}
              maxLength={1200}
            />
          </label>
          <button className="primary full" type="button" onClick={submitResponse} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
            Save my availability
          </button>
        </div>
      </div>

      <aside className="side-panel">
        <div className="share-panel">
          <p className="section-kicker"><LinkIcon size={18} aria-hidden="true" /> Links</p>
          <button className="secondary full" type="button" onClick={returnToOrganizerHome}>
            <ArrowLeft size={18} aria-hidden="true" />
            Back to my polls
          </button>
          <button className="secondary full" type="button" onClick={() => copyText(attendeeLink, "Attendee link copied.")}>
            <Clipboard size={18} aria-hidden="true" />
            Copy attendee link
          </button>
          <p className="helper-copy">
            Send this to people who should respond. They can only submit availability.
          </p>
          {isAdmin ? (
            <>
              <button className="secondary full" type="button" onClick={() => copyText(adminLink, "Admin link copied.")}>
                <Clipboard size={18} aria-hidden="true" />
                Copy admin link
              </button>
              <p className="helper-copy">
                Keep this private. It unlocks organizer controls like finalizing the result and exporting responses.
              </p>
            </>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="publish-panel">
            <p className="section-kicker"><Trophy size={18} aria-hidden="true" /> Organizer controls</p>
            <p className="helper-copy">
              Results update automatically as people respond. Finalizing saves the chosen time and shows it at the top of the attendee link.
            </p>
            <label>
              Chosen time
              <select
                value={selectedOptionId ?? ""}
                onChange={(event) => setSelectedOptionId(event.target.value)}
              >
                {poll.options.map((option) => {
                  const formatted = formatOption(option, poll.poll.timezone, poll.poll.pollType);
                  return (
                    <option key={option.id} value={option.id}>
                      {formatted.day} {formatted.time}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Result note
              <textarea
                value={publishNote}
                onChange={(event) => setPublishNote(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Optional note people will see with the final time"
              />
            </label>
            <button className="primary full" type="button" onClick={finalizeResult} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Trophy size={18} aria-hidden="true" />}
              Finalize chosen time
            </button>
            <button className="secondary full" type="button" onClick={() => copyText(summaryText(), "Summary copied.")}>
              <Clipboard size={18} aria-hidden="true" />
              Copy summary
            </button>
            <button className="secondary full" type="button" onClick={downloadCsv}>
              <Download size={18} aria-hidden="true" />
              Download responses CSV
            </button>
          </div>
        ) : (
          <div className="publish-panel">
            <p className="section-kicker"><Trophy size={18} aria-hidden="true" /> Results</p>
            <p className="helper-copy">
              The organizer sees admin-only controls for finalizing a time. As an attendee, you just save your availability here.
            </p>
          </div>
        )}

        <div className="feedback-panel">
          <p className="section-kicker">{poll.responses.length} responses</p>
          {poll.responses.length ? (
            poll.responses.map((response) => (
              <div className="feedback-item" key={response.id}>
                <strong>{response.name}</strong>
                <span>
                  {response.slots.filter((slot) => slot.availability === "yes").length} yes,
                  {" "}
                  {response.slots.filter((slot) => slot.availability === "maybe").length} maybe
                </span>
                {response.note ? <p>{response.note}</p> : null}
              </div>
            ))
          ) : (
            <p className="empty-copy">Fresh poll. First response gets the glory.</p>
          )}
        </div>
      </aside>
    </section>
  );
}
