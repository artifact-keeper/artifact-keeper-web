/**
 * An `AbortSignal` for background work that belongs to the signed-in session
 * (#1190).
 *
 * Work that should outlive the page that started it, such as polling a
 * repository delete job whose outcome is shown in a global toast, can still
 * not outlive the session: after sign-out its requests only fail as
 * unauthenticated. `endSession()` is called on logout; it aborts the current
 * signal and starts a fresh one for the next session.
 */
let controller = new AbortController();

export function sessionSignal(): AbortSignal {
  return controller.signal;
}

export function endSession(): void {
  controller.abort();
  controller = new AbortController();
}
