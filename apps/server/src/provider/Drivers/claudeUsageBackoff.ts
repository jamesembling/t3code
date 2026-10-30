import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

// Claude rate-limits its usage endpoint per account, so a probe that retries at once
// keeps every client on that login (other apps included) locked out.
const FIRST_RETRY = Duration.minutes(5);
const MAX_RETRY = Duration.hours(1);

/** Lives on the driver, so it outlasts cache invalidations and each probe's short-lived CLI. */
export const makeClaudeUsageBackoff = Effect.gen(function* () {
  const state = yield* Ref.make({ failures: 0, retryAtMillis: 0 });
  return {
    shouldRead: Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return now >= (yield* Ref.get(state)).retryAtMillis;
    }),
    record: Effect.fn("ClaudeUsageBackoff.record")(function* (succeeded: boolean) {
      if (succeeded) return yield* Ref.set(state, { failures: 0, retryAtMillis: 0 });
      const now = yield* Clock.currentTimeMillis;
      yield* Ref.update(state, ({ failures }) => ({
        failures: failures + 1,
        retryAtMillis:
          now +
          Math.min(Duration.toMillis(FIRST_RETRY) * 2 ** failures, Duration.toMillis(MAX_RETRY)),
      }));
    }),
  };
});
