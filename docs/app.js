const state = {
  poll: null,
  responses: [],
  votes: {},
  selectedOptionId: null,
  publishNote: "",
};

const availabilityCopy = { yes: "Yes", maybe: "Maybe", no: "No" };
const availabilityScore = { yes: 2, maybe: 1, no: 0 };
const repoIssuesUrl = "https://github.com/anntropea-oss/gatherround-scheduler/issues/new";

const $ = (id) => document.getElementById(id);

function clean(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePayload(payload) {
  return toBase64Url(JSON.stringify(payload));
}

function decodePayload(value) {
  return JSON.parse(fromBase64Url(value));
}

function localInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function optionFromInput(value) {
  return value ? new Date(value).toISOString() : "";
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

function formatOption(option, timezone = "UTC") {
  const date = new Date(option.startsAt);
  return {
    day: new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: timezone,
    }).format(date),
    time: new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(date),
    label: option.label,
  };
}

function toast(message, tone = "good") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast ${tone}`;
  el.hidden = false;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function rankOptions() {
  if (!state.poll) return [];
  return state.poll.options
    .map((option) => {
      const counts = { yes: 0, maybe: 0, no: 0 };
      let score = 0;
      for (const response of state.responses) {
        const slot = response.slots.find((item) => item.optionId === option.id);
        const availability = slot?.availability ?? "no";
        counts[availability] += 1;
        score += availabilityScore[availability];
      }
      return { option, counts, score };
    })
    .sort((left, right) => right.score - left.score || right.counts.yes - left.counts.yes);
}

function pollLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `poll=${encodePayload(state.poll)}`;
  return url.toString();
}

function responsePacket(response) {
  return `GATHERROUND_RESPONSE:${encodePayload(response)}`;
}

function parseResponsePackets(input) {
  const packets = [];
  const pattern = /GATHERROUND_RESPONSE:([A-Za-z0-9_-]+)/g;
  let match = pattern.exec(input);
  while (match) {
    packets.push(decodePayload(match[1]));
    match = pattern.exec(input);
  }
  return packets;
}

function summaryText() {
  if (!state.poll) return "";
  const ranked = rankOptions();
  const winner =
    state.poll.options.find((option) => option.id === state.selectedOptionId) ?? ranked[0]?.option;
  const winnerText = winner
    ? `${formatOption(winner, state.poll.timezone).day} at ${formatOption(winner, state.poll.timezone).time}`
    : "No winning time yet";
  return [
    state.poll.title,
    `Result: ${winnerText}`,
    state.publishNote ? `Note: ${state.publishNote}` : "",
    `Poll: ${pollLink()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function csvText() {
  const header = [
    "Name",
    ...state.poll.options.map((option) => {
      const formatted = formatOption(option, state.poll.timezone);
      return `${formatted.day} ${formatted.time}`;
    }),
    "Feedback",
  ];
  const rows = state.responses.map((response) => [
    response.name,
    ...state.poll.options.map((option) => {
      const slot = response.slots.find((item) => item.optionId === option.id);
      return availabilityCopy[slot?.availability ?? "no"];
    }),
    response.note,
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function copyText(text, message = "Copied.") {
  navigator.clipboard.writeText(text).then(
    () => toast(message),
    () => toast("Clipboard was blocked by the browser.", "bad"),
  );
}

function renderDraftOptions(options = defaultOptions()) {
  const root = $("draft-options");
  root.replaceChildren();
  for (const option of options) {
    const row = document.createElement("div");
    row.className = "draft-option";
    row.dataset.id = option.id;
    row.innerHTML = `
      <input type="datetime-local" aria-label="Candidate time" value="${localInputValue(new Date(option.startsAt))}">
      <input aria-label="Candidate label" maxlength="120" value="${option.label}" placeholder="Label">
    `;
    root.append(row);
  }
}

function readDraftOptions() {
  return [...$("draft-options").querySelectorAll(".draft-option")]
    .map((row) => {
      const inputs = row.querySelectorAll("input");
      return {
        id: row.dataset.id,
        startsAt: optionFromInput(inputs[0].value),
        label: clean(inputs[1].value, 120),
      };
    })
    .filter((option) => option.startsAt && !Number.isNaN(Date.parse(option.startsAt)));
}

function createPoll() {
  const options = readDraftOptions();
  if (!clean($("title").value, 120)) {
    toast("A poll title is required.", "bad");
    return;
  }
  if (options.length < 2) {
    toast("Add at least two time options.", "bad");
    return;
  }

  state.poll = {
    id: crypto.randomUUID(),
    title: clean($("title").value, 120),
    description: clean($("description").value, 1200),
    organizerName: clean($("organizer").value, 120),
    timezone: clean($("timezone").value, 80) || "UTC",
    options,
    status: "collecting",
    selectedOptionId: null,
    publishNote: "",
    createdAt: new Date().toISOString(),
  };
  state.responses = [];
  state.votes = Object.fromEntries(options.map((option) => [option.id, "no"]));
  state.selectedOptionId = options[0].id;
  window.location.hash = `poll=${encodePayload(state.poll)}`;
  renderPoll();
  toast("Poll launched. Share the link when ready.");
}

function renderPoll() {
  if (!state.poll) return;
  $("creator").hidden = true;
  $("poll-view").hidden = false;
  $("host-line").textContent = `${state.poll.organizerName || "Host"} is gathering availability`;
  $("poll-title").textContent = state.poll.title;
  $("poll-description").textContent = state.poll.description;
  $("poll-status").textContent = state.poll.status === "published" ? "Result published" : "Collecting";
  $("poll-status").className = `status ${state.poll.status}`;
  $("publish-note").value = state.publishNote;
  renderResults();
  renderVotes();
  renderSelectedOptions();
  renderFeedback();
}

function renderResults() {
  const ranked = rankOptions();
  const root = $("results");
  const maxScore = Math.max(1, (state.responses.length || 1) * 2);
  root.replaceChildren();
  ranked.forEach(({ option, counts, score }, index) => {
    const formatted = formatOption(option, state.poll.timezone);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `time-result ${option.id === state.selectedOptionId ? "selected" : ""}`;
    button.innerHTML = `
      <span class="rank">#${index + 1}</span>
      <strong>${formatted.day}</strong>
      <span>${formatted.time}</span>
      ${formatted.label ? `<em>${formatted.label}</em>` : ""}
      <i class="meter" style="--fill: ${Math.round((score / maxScore) * 100)}%"></i>
      <small>${counts.yes} yes / ${counts.maybe} maybe</small>
    `;
    button.addEventListener("click", () => {
      state.selectedOptionId = option.id;
      renderPoll();
    });
    root.append(button);
  });

  const winner = state.poll.options.find((option) => option.id === state.selectedOptionId) ?? ranked[0]?.option;
  const banner = $("winner");
  if (state.poll.status === "published" && winner) {
    const formatted = formatOption(winner, state.poll.timezone);
    banner.hidden = false;
    banner.innerHTML = `<strong>${formatted.day} at ${formatted.time}</strong><span>${state.publishNote || "This is the time to rally around."}</span>`;
  } else {
    banner.hidden = true;
  }
}

function renderVotes() {
  const root = $("vote-list");
  root.replaceChildren();
  for (const option of state.poll.options) {
    const formatted = formatOption(option, state.poll.timezone);
    const row = document.createElement("div");
    row.className = "vote-row";
    row.innerHTML = `
      <div><strong>${formatted.day}</strong><span>${formatted.time}${formatted.label ? ` - ${formatted.label}` : ""}</span></div>
      <div class="segmented" aria-label="${formatted.day} ${formatted.time}">
        ${["yes", "maybe", "no"]
          .map(
            (availability) =>
              `<button class="${state.votes[option.id] === availability ? "active" : ""}" data-option="${option.id}" data-availability="${availability}" type="button">${availabilityCopy[availability]}</button>`,
          )
          .join("")}
      </div>
    `;
    root.append(row);
  }
}

function renderSelectedOptions() {
  const select = $("selected-option");
  select.replaceChildren();
  for (const option of state.poll.options) {
    const formatted = formatOption(option, state.poll.timezone);
    const item = document.createElement("option");
    item.value = option.id;
    item.textContent = `${formatted.day} ${formatted.time}`;
    item.selected = option.id === state.selectedOptionId;
    select.append(item);
  }
}

function renderFeedback() {
  $("response-count").textContent = `${state.responses.length} responses`;
  const root = $("feedback-list");
  root.replaceChildren();
  if (!state.responses.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "Fresh poll. First response gets the glory.";
    root.append(empty);
    return;
  }
  for (const response of state.responses) {
    const item = document.createElement("div");
    item.className = "feedback-item";
    item.innerHTML = `
      <strong>${response.name}</strong>
      <span>${response.slots.filter((slot) => slot.availability === "yes").length} yes, ${response.slots.filter((slot) => slot.availability === "maybe").length} maybe</span>
      ${response.note ? `<p>${response.note}</p>` : ""}
    `;
    root.append(item);
  }
}

function buildResponse() {
  const name = clean($("reply-name").value, 120);
  if (!name) {
    toast("Name is required.", "bad");
    return null;
  }
  if (!Object.values(state.votes).some((vote) => vote !== "no")) {
    toast("Pick at least one yes or maybe.", "bad");
    return null;
  }
  return {
    id: crypto.randomUUID(),
    pollId: state.poll.id,
    name,
    email: clean($("reply-email").value, 180),
    note: clean($("reply-note").value, 1200),
    slots: state.poll.options.map((option) => ({
      optionId: option.id,
      availability: state.votes[option.id] ?? "no",
    })),
    createdAt: new Date().toISOString(),
  };
}

function importResponses(text) {
  const packets = parseResponsePackets(text);
  if (!packets.length) {
    toast("No response packets found.", "bad");
    return;
  }
  let added = 0;
  for (const packet of packets) {
    if (packet.pollId !== state.poll.id) continue;
    const index = state.responses.findIndex((response) => response.id === packet.id || response.name === packet.name);
    if (index >= 0) {
      state.responses[index] = packet;
    } else {
      state.responses.push(packet);
      added += 1;
    }
  }
  renderPoll();
  toast(`${added} response${added === 1 ? "" : "s"} imported.`);
}

function downloadCsv() {
  const blob = new Blob([csvText()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.poll.title || "gatherround"}-responses.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function openIssue() {
  const response = buildResponse();
  if (!response) return;
  const body = [
    `Poll: ${state.poll.title}`,
    "",
    responsePacket(response),
    "",
    "Availability:",
    ...response.slots.map((slot) => {
      const option = state.poll.options.find((item) => item.id === slot.optionId);
      const formatted = formatOption(option, state.poll.timezone);
      return `- ${formatted.day} ${formatted.time}: ${availabilityCopy[slot.availability]}`;
    }),
    response.note ? `\nNote: ${response.note}` : "",
  ].join("\n");
  const url = new URL(repoIssuesUrl);
  url.searchParams.set("title", `Availability for ${state.poll.title} from ${response.name}`);
  url.searchParams.set("body", body);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function initFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash.startsWith("poll=")) return false;
  try {
    state.poll = decodePayload(hash.slice(5));
    state.responses = [];
    state.votes = Object.fromEntries(state.poll.options.map((option) => [option.id, "no"]));
    state.selectedOptionId = state.poll.selectedOptionId ?? state.poll.options[0]?.id ?? null;
    state.publishNote = state.poll.publishNote ?? "";
    renderPoll();
    return true;
  } catch {
    toast("That poll link could not be opened.", "bad");
    return false;
  }
}

function bindEvents() {
  $("timezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  renderDraftOptions();

  $("add-option").addEventListener("click", () => {
    const options = readDraftOptions();
    const last = options.at(-1);
    const date = last?.startsAt ? new Date(last.startsAt) : new Date();
    date.setDate(date.getDate() + 1);
    options.push({ id: crypto.randomUUID(), startsAt: date.toISOString(), label: "" });
    renderDraftOptions(options);
  });

  $("launch").addEventListener("click", createPoll);
  $("copy-poll").addEventListener("click", () => copyText(pollLink(), "Poll link copied."));
  $("copy-summary").addEventListener("click", () => copyText(summaryText(), "Summary copied."));
  $("download-csv").addEventListener("click", downloadCsv);
  $("open-issue").addEventListener("click", openIssue);
  $("selected-option").addEventListener("change", (event) => {
    state.selectedOptionId = event.target.value;
    renderPoll();
  });
  $("publish-note").addEventListener("input", (event) => {
    state.publishNote = event.target.value;
  });
  $("publish-result").addEventListener("click", () => {
    state.poll.status = "published";
    state.poll.selectedOptionId = state.selectedOptionId;
    state.poll.publishNote = clean($("publish-note").value, 1000);
    state.publishNote = state.poll.publishNote;
    window.location.hash = `poll=${encodePayload(state.poll)}`;
    renderPoll();
    copyText(summaryText(), "Result published and summary copied.");
  });
  $("copy-response").addEventListener("click", () => {
    const response = buildResponse();
    if (!response) return;
    copyText(responsePacket(response), "Response packet copied.");
  });
  $("import-responses").addEventListener("click", () => importResponses($("response-import").value));
  $("vote-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-option]");
    if (!button) return;
    state.votes[button.dataset.option] = button.dataset.availability;
    renderVotes();
  });
}

bindEvents();
initFromHash();
