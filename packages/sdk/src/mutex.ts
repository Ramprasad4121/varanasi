/**
 * @author Ramprasad
 * Tiny FIFO async lock. Every state change (spend, revoke, register) runs
 * inside it, so two spends can never both read the same "spent so far".
 */
export class Mutex {
  #tail: Promise<void> = Promise.resolve();

  /** Run `fn` after every previously queued task has settled. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(fn);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
