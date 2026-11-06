import type { Meal } from './plan';
import { shiftDate } from './dates';
export type DayRecord = { date: string; meals: Meal[]; water: number; steps: number; workoutDone: boolean; activity: string; target: number; weight: number };
export function archiveDay(history: DayRecord[], day: DayRecord) {
  return [...history.filter(d => d.date !== day.date), day].sort((a,b) => a.date.localeCompare(b.date));
}
export function weightTrend(points: { date: string; value: number }[], today: string) {
  const recent = points.filter(p => p.date >= shiftDate(today, -6) && p.date <= today);
  const previous = points.filter(p => p.date >= shiftDate(today, -13) && p.date < shiftDate(today, -6));
  const avg = (p: typeof points) => p.reduce((s,x) => s+x.value,0) / p.length;
  return { recent: recent.length ? avg(recent) : null, previous: previous.length ? avg(previous) : null, change: recent.length >= 2 && previous.length >= 2 ? avg(recent) - avg(previous) : null, readings: recent.length };
}
