"use client";

import {
  CalendarPlus,
  Check,
  Clipboard,
  Download,
  Link as LinkIcon,
  Loader2,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Availability = "yes" | "maybe" | "no";

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
    status: string;
    selectedOptionId: string | null;
    publishNote: string;
    admin: boolean;
    adminToken?: string;
  };
  options: PollOption[];
  responses: PollResponse[];
};

type DraftOption = {
  id: string;
  startsAt: string;
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

function localInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultOptions() {
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
      label: index === 0 ? "Coffee window" : index === 1 ? "Deep work slot" : "Wrap-up slot",
    };
  });
}

function optionFromInput(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function formatOption(option: Pick<PollOption, "startsAt" | "label">, timezone?: string) {
  const date = new Date(option.startsAt);
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
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
  const [draft, setDraft] = useState({
    title: "Strategy sync",
    description: "Pick the times that feel good, mark maybes honestly, and leave any useful constraints.",
    organizerName: "Alex",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>(() => defaultOptions());
  const [poll, setPoll] = useState<PollPayload | null>(null);
  const [adminToken, setAdminToken] = useState(() => readUrlState().admin);
  const [loadingPoll, setLoadingPoll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [replyName, setReplyName] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [replyNote, setReplyNote] = useState("");
  const [votes, setVotes] = useState<Record<string, Availability>>({});
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState("");

  const ranked = useMemo(
    () => (poll ? rankOptions(poll.options, poll.responses) : []),
    [poll],
  );
  const top = ranked[0];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const guestLink = poll ? `${origin}/?poll=${poll.poll.id}` : "";
  const ownerLink = poll && adminToken ? `${guestLink}&admin=${adminToken}` : "";
  const bestOption = poll?.options.find((option) => option.id === poll.poll.selectedOptionId) ?? top?.option;

  const applyPoll = useCallback((nextPoll: PollPayload) => {
    const nextRanked = rankOptions(nextPoll.options, nextPoll.responses);
    setPoll(nextPoll);
    setVotes(
      Object.fromEntries(nextPoll.options.map((option) => [option.id, "no" as Availability])),
    );
    setSelectedOptionId(nextPoll.poll.selectedOptionId ?? nextRanked[0]?.option.id ?? null);
    setPublishNote(nextPoll.poll.publishNote);
  }, []);

  const loadPoll = useCallback(async (pollId: string, admin = "") => {
    setLoadingPoll(true);
    try {
      const suffix = admin ? `?admin=${encodeURIComponent(admin)}` : "";
      const response = await fetch(`/api/polls/${pollId}${suffix}`);
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

  async function createNewPoll() {
    setBusy(true);
    setToast(null);
    try {
      const response = await fetch("/api/polls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          options: draftOptions.map((option) => ({
            startsAt: option.startsAt,
            label: option.label,
          })),
        }),
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
      setToast({ tone: "good", message: "Poll launched. The links are ready." });
    } finally {
      setBusy(false);
    }
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
      setToast({ tone: "good", message: "Availability saved. Beautifully decisive." });
    } finally {
      setBusy(false);
    }
  }

  async function publishResult() {
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
      setToast({ tone: "good", message: "Result published. Share link copied next." });
      await copyText(summaryText(payload as PollPayload));
    } finally {
      setBusy(false);
    }
  }

  function addOption() {
    const last = draftOptions[draftOptions.length - 1];
    const date = last?.startsAt ? new Date(last.startsAt) : new Date();
    date.setDate(date.getDate() + 1);
    setDraftOptions([
      ...draftOptions,
      { id: crypto.randomUUID(), startsAt: date.toISOString(), label: "" },
    ]);
  }

  function updateDraftOption(id: string, value: Partial<DraftOption>) {
    setDraftOptions((options) =>
      options.map((option) => (option.id === id ? { ...option, ...value } : option)),
    );
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setToast({ tone: "good", message: "Copied." });
  }

  function summaryText(source = poll) {
    if (!source) {
      return "";
    }
    const winner = source.options.find((option) => option.id === source.poll.selectedOptionId) ?? rankOptions(source.options, source.responses)[0]?.option;
    const winnerText = winner ? `${formatOption(winner, source.poll.timezone).day} at ${formatOption(winner, source.poll.timezone).time}` : "No winning time yet";
    return [
      `${source.poll.title}`,
      `Result: ${winnerText}`,
      source.poll.publishNote ? `Note: ${source.poll.publishNote}` : "",
      `Poll: ${guestLink || `${origin}/?poll=${source.poll.id}`}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function csvText() {
    if (!poll) {
      return "";
    }
    const header = ["Name", ...poll.options.map((option) => `${formatOption(option, poll.poll.timezone).day} ${formatOption(option, poll.poll.timezone).time}`), "Feedback"];
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
      <section className="masthead" aria-label="GatherRound">
        <div>
          <p className="brand"><Sparkles size={18} aria-hidden="true" /> GatherRound</p>
          <h1>Find a meeting time without making everyone do calendar theater.</h1>
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
          guestLink={guestLink}
          ownerLink={ownerLink}
          adminToken={adminToken}
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
          publishResult={publishResult}
          copyText={copyText}
          summaryText={summaryText}
          downloadCsv={downloadCsv}
        />
      ) : (
        <section className="workspace creator">
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
            <div className="section-kicker"><Trophy size={18} aria-hidden="true" /> Candidate times</div>
            <div className="option-stack">
              {draftOptions.map((option) => (
                <div className="draft-option" key={option.id}>
                  <input
                    type="datetime-local"
                    value={localInputValue(new Date(option.startsAt))}
                    onChange={(event) =>
                      updateDraftOption(option.id, { startsAt: optionFromInput(event.target.value) })
                    }
                    aria-label="Candidate time"
                  />
                  <input
                    value={option.label}
                    onChange={(event) => updateDraftOption(option.id, { label: event.target.value })}
                    placeholder="Label"
                    maxLength={120}
                    aria-label="Candidate label"
                  />
                </div>
              ))}
            </div>
            <div className="action-row">
              <button className="secondary" type="button" onClick={addOption}>Add time</button>
              <button className="primary" type="button" onClick={createNewPoll} disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <CalendarPlus size={18} aria-hidden="true" />}
                Launch poll
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function PollWorkspace({
  poll,
  ranked,
  bestOption,
  guestLink,
  ownerLink,
  adminToken,
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
  publishResult,
  copyText,
  summaryText,
  downloadCsv,
}: {
  poll: PollPayload;
  ranked: ReturnType<typeof rankOptions>;
  bestOption: PollOption | undefined;
  guestLink: string;
  ownerLink: string;
  adminToken: string;
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
  publishResult: () => Promise<void>;
  copyText: (value: string) => Promise<void>;
  summaryText: () => string;
  downloadCsv: () => void;
}) {
  const selectedLabel = bestOption ? formatOption(bestOption, poll.poll.timezone) : null;

  return (
    <section className="workspace poll">
      <div className="poll-main">
        <div className="poll-title-row">
          <div>
            <p className="section-kicker">{poll.poll.organizerName || "Host"} is gathering availability</p>
            <h2>{poll.poll.title}</h2>
            {poll.poll.description ? <p className="description">{poll.poll.description}</p> : null}
          </div>
          <span className={`status ${poll.poll.status}`}>{poll.poll.status === "published" ? "Result published" : "Collecting"}</span>
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
            const formatted = formatOption(option, poll.poll.timezone);
            const maxScore = Math.max(1, (poll.responses.length || 1) * 2);
            return (
              <button
                className={`time-result ${option.id === selectedOptionId ? "selected" : ""}`}
                key={option.id}
                type="button"
                onClick={() => setSelectedOptionId(option.id)}
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
          <div className="section-kicker"><Check size={18} aria-hidden="true" /> Your availability</div>
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
              const formatted = formatOption(option, poll.poll.timezone);
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
            Save availability
          </button>
        </div>
      </div>

      <aside className="side-panel">
        <div className="share-panel">
          <p className="section-kicker"><LinkIcon size={18} aria-hidden="true" /> Share</p>
          <button className="secondary full" type="button" onClick={() => copyText(guestLink)}>
            <Clipboard size={18} aria-hidden="true" />
            Copy attendee link
          </button>
          {adminToken ? (
            <button className="secondary full" type="button" onClick={() => copyText(ownerLink)}>
              <Clipboard size={18} aria-hidden="true" />
              Copy admin link
            </button>
          ) : null}
          <button className="secondary full" type="button" onClick={() => copyText(summaryText())}>
            <Clipboard size={18} aria-hidden="true" />
            Copy result summary
          </button>
          <button className="secondary full" type="button" onClick={downloadCsv}>
            <Download size={18} aria-hidden="true" />
            Download CSV
          </button>
        </div>

        {adminToken ? (
          <div className="publish-panel">
            <p className="section-kicker"><Trophy size={18} aria-hidden="true" /> Publish</p>
            <label>
              Chosen time
              <select
                value={selectedOptionId ?? ""}
                onChange={(event) => setSelectedOptionId(event.target.value)}
              >
                {poll.options.map((option) => {
                  const formatted = formatOption(option, poll.poll.timezone);
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
              />
            </label>
            <button className="primary full" type="button" onClick={publishResult} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Trophy size={18} aria-hidden="true" />}
              Publish result
            </button>
          </div>
        ) : null}

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
