/** Hard cap for initial fetch: first settled result wins (fast data or fallback at deadline). */
export function raceQueryTimeout<T>(ms: number, fallback: T, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    void work()
      .then((v) => finish(v))
      .catch(() => finish(fallback));
  });
}
