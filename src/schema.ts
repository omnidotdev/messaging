import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Reference Drizzle schema apps may embed for the messaging core (or supply
 * their own via a custom `MessageRepository`). Omni convention: singular table
 * names. Ids are text so the host app controls id generation.
 *
 * Data lives in each app's own database (user sovereignty / self-host); the
 * shared piece is the *shape* and the logic, not a central store.
 */

export const conversation = pgTable("conversation", {
  id: text("id").primaryKey(),
  // "dm" (1:1) for now; "group" reserved for a later extension.
  kind: text("kind").notNull().default("dm"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id").notNull(),
    // Per-participant read cursor for unread counts.
    lastReadAt: timestamp("last_read_at"),
    mutedAt: timestamp("muted_at"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => [
    unique("conversation_participant_unique").on(
      table.conversationId,
      table.userId,
    ),
    index("conversation_participant_user_idx").on(table.userId),
  ],
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    senderId: text("sender_id").notNull(),
    body: text("body").notNull(),
    // Moderation outcome: "allow" | "review" | "block". Stored so a "review"
    // message persists hidden until cleared.
    moderation: text("moderation").notNull().default("allow"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("message_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);
