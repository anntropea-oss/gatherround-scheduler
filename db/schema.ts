import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const polls = sqliteTable("polls", {
  id: text("id").primaryKey(),
  adminToken: text("admin_token").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  organizerName: text("organizer_name").notNull().default(""),
  organizerKeyHash: text("organizer_key_hash").notNull().default(""),
  timezone: text("timezone").notNull().default("UTC"),
  pollType: text("poll_type").notNull().default("specific"),
  status: text("status").notNull().default("collecting"),
  selectedOptionId: text("selected_option_id"),
  publishNote: text("publish_note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_polls_organizer_key_hash").on(table.organizerKeyHash),
]);

export const pollOptions = sqliteTable(
  "poll_options",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    startsAt: text("starts_at").notNull(),
    label: text("label").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_poll_options_poll_id").on(table.pollId)],
);

export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_responses_poll_id").on(table.pollId)],
);

export const responseSlots = sqliteTable(
  "response_slots",
  {
    responseId: text("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    availability: text("availability").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.responseId, table.optionId] }),
    index("idx_response_slots_option_id").on(table.optionId),
  ],
);

export const uxFeedback = sqliteTable(
  "ux_feedback",
  {
    id: text("id").primaryKey(),
    sentiment: text("sentiment").notNull().default(""),
    message: text("message").notNull().default(""),
    page: text("page").notNull().default(""),
    path: text("path").notNull().default(""),
    pollId: text("poll_id"),
    role: text("role").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_ux_feedback_created_at").on(table.createdAt),
    index("idx_ux_feedback_poll_id").on(table.pollId),
  ],
);
