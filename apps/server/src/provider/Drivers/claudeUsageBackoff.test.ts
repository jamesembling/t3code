import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { makeClaudeUsageBackoff } from "./claudeUsageBackoff.ts";

const reading = (usageCheckedAt: string) => ({
  usage: { rate_limits_available: true, rate_limits: {} },
  usageCheckedAt,
});

it.effect("paces successful reads and serves the last reading in between", () =>
  Effect.gen(function* () {
    const backoff = yield* makeClaudeUsageBackoff;
    expect(yield* backoff.shouldRead).toBe(true);

    yield* backoff.record(reading("2026-10-30T23:00:00Z"));
    expect(yield* backoff.shouldRead).toBe(false);
    expect(yield* backoff.lastReading).toEqual(reading("2026-10-30T23:00:00Z"));
    yield* TestClock.adjust("5 minutes");
    expect(yield* backoff.shouldRead).toBe(true);
  }),
);

it.effect("doubles the wait after each failed read, capped at an hour, and hides stale usage", () =>
  Effect.gen(function* () {
    const backoff = yield* makeClaudeUsageBackoff;
    yield* backoff.record(reading("2026-10-30T23:00:00Z"));
    yield* TestClock.adjust("5 minutes");

    for (const wait of [
      "5 minutes",
      "10 minutes",
      "20 minutes",
      "40 minutes",
      "60 minutes",
    ] as const) {
      yield* backoff.record(undefined);
      expect(yield* backoff.shouldRead).toBe(false);
      expect(yield* backoff.lastReading).toBeUndefined();
      yield* TestClock.adjust(wait);
      expect(yield* backoff.shouldRead).toBe(true);
    }
    yield* backoff.record(undefined);
    yield* TestClock.adjust("59 minutes");
    expect(yield* backoff.shouldRead).toBe(false);

    yield* TestClock.adjust("1 minute");
    yield* backoff.record(reading("2026-10-30T23:00:00Z"));
    yield* TestClock.adjust("5 minutes");
    expect(yield* backoff.shouldRead).toBe(true);
  }),
);
