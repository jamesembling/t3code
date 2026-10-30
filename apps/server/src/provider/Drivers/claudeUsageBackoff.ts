import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import type { ClaudeCapabilitiesProbe } from "../ClaudeProvider.ts";

type UsageReading = Required<Pick<ClaudeCapabilitiesProbe, "usage" | "usageCheckedAt">>;

// Claude rate-limits its usage endpoint per account, so frequent reads lock out every
// client on that login. During a 429 the CLI replays its last response as a success,
// so failures alone cannot pace reads: every read waits, and failures wait longer.
const READ_INTERVAL = Duration.minutes(5);
const MAX_RETRY = Duration.hours(1);

/** Lives on the driver, so it outlasts cache invalidations and each probe's short-lived CLI. */
export const makeClaudeUsageBackoff = Effect.gen(function* () {
  const state = yield* Ref.make<{
    readonly failures: number;
    readonly nextReadAtMillis: number;
    readonly last: UsageReading | undefined;
  }>({ failures: 0, nextReadAtMillis: 0, last: undefined });
  return {
    /** For moments that need fresh limits at once: a sign-in or a redeemed reset. */
    reset: Ref.set(state, { failures: 0, nextReadAtMillis: 0, last: undefined }),
    shouldRead: Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return now >= (yield* Ref.get(state)).nextReadAtMillis;
    }),
    /** The last reading, while reads are only paced rather than failing. */
    lastReading: Ref.get(state).pipe(
      Effect.map(({ failures, last }) => (failures === 0 ? last : undefined)),
    ),
    record: Effect.fn("ClaudeUsageBackoff.record")(function* (reading: UsageReading | undefined) {
      const now = yield* Clock.currentTimeMillis;
      yield* Ref.update(state, ({ failures, last }) => {
        const nextFailures = reading ? 0 : failures + 1;
        const wait = Math.min(
          Duration.toMillis(READ_INTERVAL) * 2 ** Math.max(nextFailures - 1, 0),
          Duration.toMillis(MAX_RETRY),
        );
        return { failures: nextFailures, nextReadAtMillis: now + wait, last: reading ?? last };
      });
    }),
  };
});
