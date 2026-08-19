import { env } from "cloudflare:workers";

export type Availability = "yes" | "maybe" | "no";
export type PollType = "specific" | "weekly";

export type PollInput = {
  title: string;
  description: string;
  organizerName: string;
  organizerKey?: string;
  timezone: string;
  pollType?: PollType;
  options: Array<{ startsAt: string; label: string }>;
};

export type ResponseInput = {
  name: string;
  email: string;
  note: string;
  slots: Array<{ optionId: string; availability: Availability }>;
};

type PollUpdateInput = {
  status?: string;
  selectedOptionId?: string | null;
  publishNote?: string;
  title?: string;
  description?: string;
  organizerName?: string;
  timezone?: string;
  pollType?: PollType;
  options?: Array<{ startsAt: string; label: string }>;
};

type PollRow = {
  id: string;
  admin_token: string;
  title: string;
  description: string;
  organizer_name: string;
  organizer_key_hash?: string;
  timezone: string;
  poll_type?: string;
  status: string;
  selected_option_id: string | null;
  publish_note: string;
  created_at: string;
  updated_at: string;
};

type OptionRow = {
  id: string;
  poll_id: string;
  starts_at: string;
  label: string;
  sort_order: number;
};

type ResponseRow = {
  id: string;
  poll_id: string;
  name: string;
  email: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type SlotRow = {
  response_id: string;
  option_id: string;
  availability: Availability;
};

type PollSummaryRow = PollRow & {
  response_count: number;
};

export type AccessContext = {
  adminToken?: string | null;
  organizerKey?: string | null;
  superAdmin?: boolean;
};

let schemaReady: Promise<void> | null = null;

function db() {
  if (!env.DB) {
    throw new Error("Database binding DB is unavailable.");
  }
  return env.DB;
}

function token(length = 24) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashOrganizerKey(value: unknown) {
  const key = clean(value, 120);
  if (!key) {
    return "";
  }

  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
}

function isAvailability(value: string): value is Availability {
  return value === "yes" || value === "maybe" || value === "no";
}

function cleanStatus(value: unknown) {
  return value === "closed" || value === "published" ? value : "collecting";
}

async function canAdminister(poll: Pick<PollRow, "admin_token" | "organizer_key_hash">, access: AccessContext) {
  if (access.superAdmin) {
    return true;
  }
  if (access.adminToken && access.adminToken === poll.admin_token) {
    return true;
  }

  const organizerKeyHash = await hashOrganizerKey(access.organizerKey);
  return Boolean(organizerKeyHash && poll.organizer_key_hash && organizerKeyHash === poll.organizer_key_hash);
}

async function ensureSchema(database = db()) {
  schemaReady ??= database
    .batch([
      database.prepare(`
        CREATE TABLE IF NOT EXISTS polls (
          id TEXT PRIMARY KEY,
          admin_token TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          organizer_name TEXT NOT NULL DEFAULT '',
          organizer_key_hash TEXT NOT NULL DEFAULT '',
          timezone TEXT NOT NULL DEFAULT 'UTC',
          poll_type TEXT NOT NULL DEFAULT 'specific',
          status TEXT NOT NULL DEFAULT 'collecting',
          selected_option_id TEXT,
          publish_note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      database.prepare(`
        CREATE TABLE IF NOT EXISTS poll_options (
          id TEXT PRIMARY KEY,
          poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          starts_at TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0
        )
      `),
      database.prepare(`
        CREATE TABLE IF NOT EXISTS responses (
          id TEXT PRIMARY KEY,
          poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      database.prepare(`
        CREATE TABLE IF NOT EXISTS response_slots (
          response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
          option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
          availability TEXT NOT NULL,
          PRIMARY KEY (response_id, option_id)
        )
      `),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON poll_options(poll_id)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_responses_poll_id ON responses(poll_id)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_response_slots_option_id ON response_slots(option_id)"),
      database.prepare("PRAGMA optimize"),
    ])
    .then(async () => {
      const columns = await database.prepare("PRAGMA table_info(polls)").all<{ name: string }>();
      const hasPollType = (columns.results ?? []).some((column) => column.name === "poll_type");
      const hasOrganizerKeyHash = (columns.results ?? []).some((column) => column.name === "organizer_key_hash");
      if (!hasPollType) {
        await database
          .prepare("ALTER TABLE polls ADD COLUMN poll_type TEXT NOT NULL DEFAULT 'specific'")
          .run();
      }
      if (!hasOrganizerKeyHash) {
        await database
          .prepare("ALTER TABLE polls ADD COLUMN organizer_key_hash TEXT NOT NULL DEFAULT ''")
          .run();
      }
      await database
        .prepare("CREATE INDEX IF NOT EXISTS idx_polls_organizer_key_hash ON polls(organizer_key_hash)")
        .run();
    });

  return schemaReady;
}

export async function createPoll(input: PollInput) {
  const database = db();
  await ensureSchema(database);

  const title = clean(input.title, 120);
  const description = clean(input.description, 1200);
  const organizerName = clean(input.organizerName, 120);
  const organizerKeyHash = await hashOrganizerKey(input.organizerKey);
  const timezone = clean(input.timezone, 80) || "UTC";
  const pollType: PollType = input.pollType === "weekly" ? "weekly" : "specific";
  const rawOptions = input.options
    .map((option) => ({
      startsAt: clean(option.startsAt, 80),
      label: clean(option.label, 120),
    }))
    .filter((option) => option.startsAt && !Number.isNaN(Date.parse(option.startsAt)))
    .slice(0, 24);

  if (!title) {
    throw new Response("A poll title is required.", { status: 400 });
  }
  if (rawOptions.length < 2) {
    throw new Response("Add at least two time options.", { status: 400 });
  }

  const pollId = crypto.randomUUID();
  const adminToken = token();
  const statements = [
    database
      .prepare(
        "INSERT INTO polls (id, admin_token, title, description, organizer_name, organizer_key_hash, timezone, poll_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(pollId, adminToken, title, description, organizerName, organizerKeyHash, timezone, pollType),
    ...rawOptions.map((option, index) =>
      database
        .prepare(
          "INSERT INTO poll_options (id, poll_id, starts_at, label, sort_order) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), pollId, option.startsAt, option.label, index),
    ),
  ];

  await database.batch(statements);
  return getPoll(pollId, adminToken);
}

export async function listPolls(access: AccessContext) {
  const database = db();
  await ensureSchema(database);

  const organizerKeyHash = await hashOrganizerKey(access.organizerKey);
  if (!access.superAdmin && !organizerKeyHash) {
    return { polls: [], superAdmin: false };
  }

  const query = `
    SELECT polls.*, COUNT(responses.id) AS response_count
    FROM polls
    LEFT JOIN responses ON responses.poll_id = polls.id
    ${access.superAdmin ? "" : "WHERE polls.organizer_key_hash = ?"}
    GROUP BY polls.id
    ORDER BY polls.updated_at DESC, polls.created_at DESC
    LIMIT 100
  `;
  const rows = access.superAdmin
    ? await database.prepare(query).all<PollSummaryRow>()
    : await database.prepare(query).bind(organizerKeyHash).all<PollSummaryRow>();

  return {
    superAdmin: Boolean(access.superAdmin),
    polls: (rows.results ?? []).map((poll) => ({
      id: poll.id,
      title: poll.title,
      description: poll.description,
      organizerName: poll.organizer_name,
      timezone: poll.timezone,
      pollType: poll.poll_type === "weekly" ? "weekly" : "specific",
      status: poll.status,
      selectedOptionId: poll.selected_option_id,
      createdAt: poll.created_at,
      updatedAt: poll.updated_at,
      responseCount: poll.response_count,
      adminToken: poll.admin_token,
    })),
  };
}

export async function getPoll(id: string, adminTokenOrAccess?: string | null | AccessContext) {
  const database = db();
  await ensureSchema(database);
  const access: AccessContext =
    typeof adminTokenOrAccess === "object" && adminTokenOrAccess !== null
      ? adminTokenOrAccess
      : { adminToken: adminTokenOrAccess };

  const poll = await database
    .prepare("SELECT * FROM polls WHERE id = ?")
    .bind(id)
    .first<PollRow>();

  if (!poll) {
    return null;
  }

  const isAdmin = await canAdminister(poll, access);
  const options = await database
    .prepare("SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order, starts_at")
    .bind(id)
    .all<OptionRow>();
  const responses = await database
    .prepare("SELECT * FROM responses WHERE poll_id = ? ORDER BY created_at, name")
    .bind(id)
    .all<ResponseRow>();
  const slots = await database
    .prepare(`
      SELECT response_slots.response_id, response_slots.option_id, response_slots.availability
      FROM response_slots
      INNER JOIN responses ON responses.id = response_slots.response_id
      WHERE responses.poll_id = ?
    `)
    .bind(id)
    .all<SlotRow>();

  const slotsByResponse = new Map<string, SlotRow[]>();
  for (const slot of slots.results ?? []) {
    const list = slotsByResponse.get(slot.response_id) ?? [];
    list.push(slot);
    slotsByResponse.set(slot.response_id, list);
  }

  return {
    poll: {
      id: poll.id,
      title: poll.title,
      description: poll.description,
      organizerName: poll.organizer_name,
      timezone: poll.timezone,
      pollType: poll.poll_type === "weekly" ? "weekly" : "specific",
      status: poll.status,
      selectedOptionId: poll.selected_option_id,
      publishNote: poll.publish_note,
      createdAt: poll.created_at,
      updatedAt: poll.updated_at,
      admin: isAdmin,
      adminToken: isAdmin ? poll.admin_token : undefined,
    },
    options: (options.results ?? []).map((option) => ({
      id: option.id,
      pollId: option.poll_id,
      startsAt: option.starts_at,
      label: option.label,
      sortOrder: option.sort_order,
    })),
    responses: (responses.results ?? []).map((response) => ({
      id: response.id,
      name: response.name,
      email: isAdmin ? response.email : "",
      note: response.note,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
      slots: slotsByResponse.get(response.id)?.map((slot) => ({
        optionId: slot.option_id,
        availability: slot.availability,
      })) ?? [],
    })),
  };
}

export async function addResponse(pollId: string, input: ResponseInput) {
  const database = db();
  await ensureSchema(database);

  const poll = await database
    .prepare("SELECT id, status FROM polls WHERE id = ?")
    .bind(pollId)
    .first<{ id: string; status: string }>();

  if (!poll) {
    throw new Response("Poll not found.", { status: 404 });
  }
  if (poll.status !== "collecting") {
    throw new Response("This poll is not accepting new responses.", { status: 409 });
  }

  const optionRows = await database
    .prepare("SELECT id FROM poll_options WHERE poll_id = ?")
    .bind(pollId)
    .all<{ id: string }>();
  const optionIds = new Set((optionRows.results ?? []).map((option) => option.id));
  const name = clean(input.name, 120);
  const email = clean(input.email, 180);
  const note = clean(input.note, 1200);
  const slots = input.slots
    .filter((slot) => optionIds.has(slot.optionId) && isAvailability(slot.availability))
    .slice(0, 24);

  if (!name) {
    throw new Response("Name is required.", { status: 400 });
  }
  if (!slots.some((slot) => slot.availability !== "no")) {
    throw new Response("Pick at least one yes or maybe.", { status: 400 });
  }

  const responseId = crypto.randomUUID();
  await database.batch([
    database
      .prepare("INSERT INTO responses (id, poll_id, name, email, note) VALUES (?, ?, ?, ?, ?)")
      .bind(responseId, pollId, name, email, note),
    ...slots.map((slot) =>
      database
        .prepare(
          "INSERT INTO response_slots (response_id, option_id, availability) VALUES (?, ?, ?)",
        )
        .bind(responseId, slot.optionId, slot.availability),
    ),
    database
      .prepare("UPDATE polls SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(pollId),
  ]);

  return getPoll(pollId);
}

export async function updatePoll(
  pollId: string,
  adminToken: string,
  input: PollUpdateInput,
  access: Omit<AccessContext, "adminToken"> = {},
) {
  const database = db();
  await ensureSchema(database);

  const poll = await database
    .prepare("SELECT id, admin_token, organizer_key_hash, status FROM polls WHERE id = ?")
    .bind(pollId)
    .first<Pick<PollRow, "id" | "admin_token" | "organizer_key_hash" | "status">>();

  if (!poll) {
    throw new Response("Poll not found.", { status: 404 });
  }
  if (!(await canAdminister(poll, { ...access, adminToken }))) {
    throw new Response("Admin link required.", { status: 403 });
  }

  let replacementOptions: Array<{ startsAt: string; label: string }> | null = null;

  if (Array.isArray(input.options)) {
    const responseCount = await database
      .prepare("SELECT COUNT(*) AS count FROM responses WHERE poll_id = ?")
      .bind(pollId)
      .first<{ count: number }>();

    if ((responseCount?.count ?? 0) > 0) {
      throw new Response("Available times are locked after responses arrive.", { status: 409 });
    }

    replacementOptions = input.options
      .map((option) => ({
        startsAt: clean(option.startsAt, 80),
        label: clean(option.label, 120),
      }))
      .filter((option) => option.startsAt && !Number.isNaN(Date.parse(option.startsAt)))
      .slice(0, 24);

    if (replacementOptions.length < 2) {
      throw new Response("Add at least two time options.", { status: 400 });
    }
  }

  const status = typeof input.status === "string" ? cleanStatus(input.status) : poll.status;
  const publishNote = clean(input.publishNote, 1000);
  const title = clean(input.title, 120);
  const description = clean(input.description, 1200);
  const organizerName = clean(input.organizerName, 120);
  const timezone = clean(input.timezone, 80);
  const pollType: PollType | "" = input.pollType === "weekly" || input.pollType === "specific" ? input.pollType : "";
  const hasTitle = typeof input.title === "string";
  const hasDescription = typeof input.description === "string";
  const hasOrganizerName = typeof input.organizerName === "string";
  const hasTimezone = typeof input.timezone === "string";
  const hasSelectedOptionId = Object.prototype.hasOwnProperty.call(input, "selectedOptionId");
  const hasPublishNote = Object.prototype.hasOwnProperty.call(input, "publishNote");

  if (hasTitle && !title) {
    throw new Response("A poll title is required.", { status: 400 });
  }
  let selectedOptionId = input.selectedOptionId ? clean(input.selectedOptionId, 80) : null;

  if (selectedOptionId) {
    const option = await database
      .prepare("SELECT id FROM poll_options WHERE poll_id = ? AND id = ?")
      .bind(pollId, selectedOptionId)
      .first<{ id: string }>();
    selectedOptionId = option?.id ?? null;
  }

  await database
    .prepare(
      `UPDATE polls
       SET status = ?,
           selected_option_id = CASE WHEN ? THEN ? ELSE selected_option_id END,
           publish_note = CASE WHEN ? THEN ? ELSE publish_note END,
           title = CASE WHEN ? THEN ? ELSE title END,
           description = CASE WHEN ? THEN ? ELSE description END,
           organizer_name = CASE WHEN ? THEN ? ELSE organizer_name END,
           timezone = CASE WHEN ? THEN ? ELSE timezone END,
           poll_type = CASE WHEN ? THEN ? ELSE poll_type END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      status,
      hasSelectedOptionId ? 1 : 0,
      selectedOptionId,
      hasPublishNote ? 1 : 0,
      publishNote,
      hasTitle ? 1 : 0,
      title,
      hasDescription ? 1 : 0,
      description,
      hasOrganizerName ? 1 : 0,
      organizerName,
      hasTimezone ? 1 : 0,
      timezone,
      pollType ? 1 : 0,
      pollType,
      pollId,
    )
    .run();

  if (replacementOptions) {
    await database.batch([
      database.prepare("DELETE FROM poll_options WHERE poll_id = ?").bind(pollId),
      database.prepare("UPDATE polls SET selected_option_id = NULL WHERE id = ?").bind(pollId),
      ...replacementOptions.map((option, index) =>
        database
          .prepare(
            "INSERT INTO poll_options (id, poll_id, starts_at, label, sort_order) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(crypto.randomUUID(), pollId, option.startsAt, option.label, index),
      ),
    ]);
  }

  return getPoll(pollId, { ...access, adminToken });
}
