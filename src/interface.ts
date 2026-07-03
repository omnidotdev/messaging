/**
 * Seam interfaces for the shared messaging core.
 *
 * The core orchestrates sending a message; every app-specific decision is
 * injected through these seams, so the same core serves SFW (moment) and adult,
 * monetized (Thraddies) alike, and centralized or (later) federated transport,
 * without baking any app's policy into the library.
 */

export type UserId = string;
export type ConversationId = string;
export type MessageId = string;

export interface Message {
  id: MessageId;
  conversationId: ConversationId;
  senderId: UserId;
  body: string;
  /** Moderation outcome recorded on the stored message. */
  moderation: ModerationVerdict;
  createdAt: Date;
}

export interface SendMessageInput {
  conversationId: ConversationId;
  senderId: UserId;
  /** The 1:1 counterpart, used for authorization + delivery. */
  recipientId: UserId;
  body: string;
  mediaKeys?: string[];
}

/** Whether the sender may message the recipient (subscription, blocks, friendship). */
export interface AuthorizeResult {
  allowed: boolean;
  reason?: string;
}

/** Content moderation outcome. `review` persists hidden; `block` rejects. */
export type ModerationVerdict = "allow" | "review" | "block";

/** Free, or a one-off charge that must clear before the message is delivered. */
export type PricingDecision =
  | { kind: "free" }
  | { kind: "paid"; amountInCents: number };

/**
 * App-injected policy. Adult apps plug in strict moderation + paid DMs; SFW apps
 * return allow/free. Keeping these in the host app keeps the FOSS core neutral.
 */
export interface MessagePolicy {
  authorize(input: SendMessageInput): Promise<AuthorizeResult>;
  moderate(input: SendMessageInput): Promise<ModerationVerdict>;
  price(input: SendMessageInput): Promise<PricingDecision>;
  /** Charge for a paid message; resolve true on success. Only called when priced. */
  charge?(input: SendMessageInput, amountInCents: number): Promise<boolean>;
}

/** Persistence seam. The host provides a DB-backed implementation. */
export interface MessageRepository {
  insertMessage(
    input: SendMessageInput,
    moderation: ModerationVerdict,
  ): Promise<Message>;
}

/** Realtime (and, later, federated) delivery of a message to a recipient. */
export interface Transport {
  deliver(message: Message, recipientId: UserId): Promise<void>;
}

/** Out-of-band notification (web push / in-app), optional. */
export interface NotificationSink {
  notify(recipientId: UserId, message: Message): Promise<void>;
}

export interface MessagingDeps {
  policy: MessagePolicy;
  repository: MessageRepository;
  transport: Transport;
  notifications?: NotificationSink;
}

export type SendMessageResult =
  | { ok: true; message: Message }
  | { ok: false; error: string };
