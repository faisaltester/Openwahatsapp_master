/** Interruptible delays and request boundaries for one bulk-group run. */
export class BulkGroupRunControl {
  private readonly controller = new AbortController();
  private readonly listeners = new Set<() => void>();
  private isPaused = false;

  get signal(): AbortSignal { return this.controller.signal; }
  get stopped(): boolean { return this.signal.aborted; }
  get paused(): boolean { return this.isPaused; }

  pause(): void {
    if (this.stopped || this.isPaused) return;
    this.isPaused = true;
    this.notify();
  }
  resume(): void {
    if (this.stopped || !this.isPaused) return;
    this.isPaused = false;
    this.notify();
  }
  stop(): void {
    if (this.stopped) return;
    this.isPaused = false;
    this.controller.abort();
    this.notify();
  }
  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /** Pause freezes the remaining delay. Stop rejects immediately, even during batch rest. */
  wait(durationMs: number | (() => number) = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      let elapsed = 0;
      let activeSince: number | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const clearTimer = () => {
        clearTimeout(timer);
        timer = undefined;
        if (activeSince !== null) elapsed += performance.now() - activeSince;
        activeSince = null;
      };
      const finish = (error?: unknown) => {
        clearTimer();
        this.listeners.delete(update);
        if (error) reject(error); else resolve();
      };
      const update = () => {
        clearTimer();
        if (this.stopped) { finish(this.signal.reason); return; }
        if (this.isPaused) return;
        const budget = typeof durationMs === 'function' ? durationMs() : durationMs;
        const remaining = Math.max(0, budget - elapsed);
        if (remaining <= 0) { finish(); return; }
        activeSince = performance.now();
        timer = setTimeout(() => finish(), remaining);
      };
      this.listeners.add(update);
      update();
    });
  }

  /** Pause gates new calls without abandoning an already-dispatched WhatsApp mutation. */
  async request<T>(operation: (signal: AbortSignal) => Promise<T>, timeout: number | (() => number)): Promise<T> {
    await this.wait();
    this.signal.throwIfAborted();
    const timeoutMs = typeof timeout === 'function' ? timeout() : timeout;
    const controller = new AbortController();
    const forwardStop = () => controller.abort(this.signal.reason);
    this.signal.addEventListener('abort', forwardStop, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException(
      `No confirmation after ${Math.round(timeoutMs / 1000)} seconds`, 'TimeoutError',
    )), timeoutMs);
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    try {
      // Racing the abort also releases the UI if an upstream client ignores cancellation.
      return await Promise.race([
        Promise.resolve().then(() => { controller.signal.throwIfAborted(); return operation(controller.signal); }),
        aborted,
      ]);
    } finally {
      clearTimeout(timer);
      this.signal.removeEventListener('abort', forwardStop);
      controller.signal.removeEventListener('abort', rejectAbort);
    }
  }
}
