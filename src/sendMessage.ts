import type {
  MessagingDeps,
  SendMessageInput,
  SendMessageResult,
} from "./interface";

/**
 * Send a message through the pluggable seams, in order:
 *   authorize -> moderate -> price (+ charge) -> persist -> deliver -> notify
 *
 * Every app-specific decision (blocks/subscription gating, adult moderation,
 * paid DMs) is injected via `deps.policy`, so this core stays neutral and is
 * reusable across SFW and adult, centralized and (later) federated apps.
 *
 * A `block` verdict rejects before persisting; a `review` verdict persists the
 * message (hidden) but is not delivered/notified until moderation clears it.
 */
export async function sendMessage(
  input: SendMessageInput,
  deps: MessagingDeps,
): Promise<SendMessageResult> {
  const auth = await deps.policy.authorize(input);
  if (!auth.allowed) {
    return { ok: false, error: auth.reason ?? "Not allowed" };
  }

  const verdict = await deps.policy.moderate(input);
  if (verdict === "block") {
    return { ok: false, error: "Message blocked by moderation" };
  }

  const price = await deps.policy.price(input);
  if (price.kind === "paid") {
    if (!deps.policy.charge) {
      return { ok: false, error: "Paid messages are not supported here" };
    }
    const paid = await deps.policy.charge(input, price.amountInCents);
    if (!paid) {
      return { ok: false, error: "Payment failed" };
    }
  }

  const message = await deps.repository.insertMessage(input, verdict);

  // Only surface content that cleared moderation; `review` stays hidden until
  // a human/automated pass clears it.
  if (verdict === "allow") {
    await deps.transport.deliver(message, input.recipientId);
    await deps.notifications?.notify(input.recipientId, message);
  }

  return { ok: true, message };
}
