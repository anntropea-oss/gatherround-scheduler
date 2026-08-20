import { env } from "cloudflare:workers";

export type FeedbackInput = {
  sentiment: string;
  message: string;
  page: string;
  path: string;
  pollId?: string | null;
  role: string;
  userAgent: string;
};

export type FeedbackItem = {
  id: string;
  sentiment: string;
  message: string;
  page: string;
  path: string;
  pollId: string | null;
  role: string;
  createdAt: string;
};

type FeedbackRow = {
  id: string;
  sentiment: string;
  message: string;
  page: string;
  path: string;
  poll_id: string | null;
  role: string;
  created_at: string;
};

let feedbackSchemaReady: Promise<void> | null = null;

function db() {
  if (!env.DB) {
    throw new Error("Database binding DB is unavailable.");
  }
  return env.DB;
}

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanSentiment(value: unknown) {
  return value === "confusing" || value === "fine" || value === "loved" ? value : "";
}

async function ensureFeedbackSchema(database = db()) {
  feedbackSchemaReady ??= database.batch([
    database.prepare(`
      CREATE TABLE IF NOT EXISTS ux_feedback (
        id TEXT PRIMARY KEY,
        sentiment TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        page TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL DEFAULT '',
        poll_id TEXT,
        role TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ux_feedback_created_at ON ux_feedback(created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ux_feedback_poll_id ON ux_feedback(poll_id)"),
  ]).then(() => undefined);

  return feedbackSchemaReady;
}

export async function addFeedback(input: FeedbackInput) {
  const database = db();
  await ensureFeedbackSchema(database);

  const sentiment = cleanSentiment(input.sentiment);
  const message = clean(input.message, 1200);

  if (!sentiment && !message) {
    throw new Response("Choose a vibe or leave a note.", { status: 400 });
  }

  await database
    .prepare(
      `INSERT INTO ux_feedback
       (id, sentiment, message, page, path, poll_id, role, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      sentiment,
      message,
      clean(input.page, 80),
      clean(input.path, 500),
      clean(input.pollId, 80) || null,
      clean(input.role, 80),
      clean(input.userAgent, 500),
    )
    .run();

  return { ok: true };
}

export async function listFeedback(): Promise<FeedbackItem[]> {
  const database = db();
  await ensureFeedbackSchema(database);

  const rows = await database
    .prepare(
      `SELECT id, sentiment, message, page, path, poll_id, role, created_at
       FROM ux_feedback
       ORDER BY created_at DESC
       LIMIT 100`,
    )
    .all<FeedbackRow>();

  return (rows.results ?? []).map((item) => ({
    id: item.id,
    sentiment: item.sentiment,
    message: item.message,
    page: item.page,
    path: item.path,
    pollId: item.poll_id,
    role: item.role,
    createdAt: item.created_at,
  }));
}
