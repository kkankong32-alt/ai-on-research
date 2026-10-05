export function indices(values) {
  const v = values.filter((x) => Number.isInteger(x) && x >= 1 && x <= 4),
    N = v.length;
  if (!N) return { N: 0, I: null, k: null, cvr: null };
  const A = v.filter((x) => x >= 3).length;
  let comb = 1;
  for (let i = 1; i <= A; i++) comb = (comb * (N - A + i)) / i;
  const pc = comb * 0.5 ** N,
    I = A / N;
  return { N, A, I, k: (I - pc) / (1 - pc), cvr: (A - N / 2) / (N / 2) };
}
export function scaleIndices(items, raters, key = "r") {
  const valid = items
    .map(([id]) => indices(raters.map((x) => x.ratings?.[id]?.[key])))
    .filter((x) => x.N);
  return {
    ave: valid.length
      ? valid.reduce((a, x) => a + x.I, 0) / valid.length
      : null,
    ua: valid.length
      ? valid.filter((x) => x.I === 1).length / valid.length
      : null,
  };
}
