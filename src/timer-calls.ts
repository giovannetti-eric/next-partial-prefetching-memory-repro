// Counts the timers scheduled during renders, by the kind of render that scheduled
// them. Plain module state: it holds a handful of integers and nothing else.
type Calls = Record<string, number>;

const store = globalThis as { __timerCalls?: Calls };

export function recordTimerCall(kind: string) {
  store.__timerCalls ??= {};
  store.__timerCalls[kind] = (store.__timerCalls[kind] ?? 0) + 1;
}

export function timerCalls(): Calls {
  return { ...(store.__timerCalls ?? {}) };
}
