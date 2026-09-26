// Diary progress stats. Pure.

/** Logged days in a row ending today (or yesterday, if today is still empty). Oldest → newest input. */
export function loggingStreak(days: { kcal: number }[]): number {
  let i = days.length - 1;
  if (i >= 0 && days[i].kcal === 0) i--;
  let n = 0;
  for (; i >= 0 && days[i].kcal > 0; i--) n++;
  return n;
}
