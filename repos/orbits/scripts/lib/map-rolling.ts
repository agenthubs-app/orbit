export async function mapRolling<TValue, TResult>(
  values: readonly TValue[],
  concurrency: number,
  evaluate: (value: TValue) => Promise<TResult>,
): Promise<readonly TResult[]> {
  const results = new Array<TResult>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        results[index] = await evaluate(values[index]!);
      }
    }),
  );
  return results;
}
