import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { makeClaudeUsageBackoff } from "./claudeUsageBackoff.ts";

it.effect("doubles the wait after each failed usage read, capped at an hour", () =>
  Effect.gen(function* () {
    const backoff = yield* makeClaudeUsageBackoff;
    expect(yield* backoff.shouldRead).toBe(true);

    for (const wait of [
      "5 minutes",
      "10 minutes",
      "20 minutes",
      "40 minutes",
      "60 minutes",
    ] as const) {
      yield* backoff.record(false);
      expect(yield* backoff.shouldRead).toBe(false);
      yield* TestClock.adjust(wait);
      expect(yield* backoff.shouldRead).toBe(true);
    }
    yield* backoff.record(false);
    yield* TestClock.adjust("59 minutes");
    expect(yield* backoff.shouldRead).toBe(false);
  }),
);

it.effect("a successful read clears the back-off", () =>
  Effect.gen(function* () {
    const backoff = yield* makeClaudeUsageBackoff;
    yield* backoff.record(false);
    yield* backoff.record(false);
    yield* backoff.record(true);
    expect(yield* backoff.shouldRead).toBe(true);

    yield* backoff.record(false);
    yield* TestClock.adjust("5 minutes");
    expect(yield* backoff.shouldRead).toBe(true);
  }),
);
