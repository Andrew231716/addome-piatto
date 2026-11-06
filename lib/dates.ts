export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDate(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return localDate(date);
}
export function weekDates(day = localDate()) {
  const date = new Date(`${day}T12:00:00`);
  const monday = shiftDate(day, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}
