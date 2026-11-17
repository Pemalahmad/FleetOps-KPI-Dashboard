/** Serialise warehouse mutations so a second import cannot interleave with a running build. */
export function createTaskQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task);
    tail = next.catch(() => undefined);
    return next;
  };
}
