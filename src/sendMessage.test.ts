import { describe, expect, test } from "bun:test";

import type {
  AuthorizeResult,
  Message,
  MessagingDeps,
  ModerationVerdict,
  PricingDecision,
  SendMessageInput,
} from "./interface";
import { sendMessage } from "./sendMessage";

const input: SendMessageInput = {
  conversationId: "c1",
  senderId: "u1",
  recipientId: "u2",
  body: "hey",
};

function deps(overrides: {
  authorize?: AuthorizeResult;
  moderate?: ModerationVerdict;
  price?: PricingDecision;
  charge?: boolean;
}) {
  const calls = {
    inserted: 0,
    delivered: 0,
    notified: 0,
    charged: 0,
  };
  const message: Message = {
    id: "m1",
    conversationId: "c1",
    senderId: "u1",
    body: "hey",
    moderation: overrides.moderate ?? "allow",
    createdAt: new Date(0),
  };
  const d: MessagingDeps = {
    policy: {
      authorize: async () => overrides.authorize ?? { allowed: true },
      moderate: async () => overrides.moderate ?? "allow",
      price: async () => overrides.price ?? { kind: "free" },
      charge: async () => {
        calls.charged++;
        return overrides.charge ?? true;
      },
    },
    repository: {
      insertMessage: async () => {
        calls.inserted++;
        return message;
      },
    },
    transport: {
      deliver: async () => {
        calls.delivered++;
      },
    },
    notifications: {
      notify: async () => {
        calls.notified++;
      },
    },
  };
  return { d, calls };
}

describe("sendMessage", () => {
  test("delivers and notifies an authorized, allowed, free message", async () => {
    const { d, calls } = deps({});
    const result = await sendMessage(input, d);
    expect(result.ok).toBe(true);
    expect(calls).toMatchObject({
      inserted: 1,
      delivered: 1,
      notified: 1,
      charged: 0,
    });
  });

  test("rejects when not authorized, without persisting", async () => {
    const { d, calls } = deps({
      authorize: { allowed: false, reason: "You are blocked" },
    });
    const result = await sendMessage(input, d);
    expect(result).toEqual({ ok: false, error: "You are blocked" });
    expect(calls.inserted).toBe(0);
  });

  test("rejects a blocked message, without persisting", async () => {
    const { d, calls } = deps({ moderate: "block" });
    const result = await sendMessage(input, d);
    expect(result.ok).toBe(false);
    expect(calls.inserted).toBe(0);
    expect(calls.delivered).toBe(0);
  });

  test("charges a paid message before delivering", async () => {
    const { d, calls } = deps({ price: { kind: "paid", amountInCents: 500 } });
    const result = await sendMessage(input, d);
    expect(result.ok).toBe(true);
    expect(calls).toMatchObject({ charged: 1, inserted: 1, delivered: 1 });
  });

  test("does not persist or deliver when payment fails", async () => {
    const { d, calls } = deps({
      price: { kind: "paid", amountInCents: 500 },
      charge: false,
    });
    const result = await sendMessage(input, d);
    expect(result).toEqual({ ok: false, error: "Payment failed" });
    expect(calls.inserted).toBe(0);
    expect(calls.delivered).toBe(0);
  });

  test("persists a 'review' message but does NOT deliver or notify", async () => {
    const { d, calls } = deps({ moderate: "review" });
    const result = await sendMessage(input, d);
    expect(result.ok).toBe(true);
    expect(calls.inserted).toBe(1);
    expect(calls.delivered).toBe(0);
    expect(calls.notified).toBe(0);
  });
});
