export type NotifyPrefs = {
  workout: boolean;
  meals: boolean;
  coach: boolean;
  weekly: boolean;
};

const LAST_KEY = "gym-food-notify-last-v1";

type LastFired = Partial<Record<"workout" | "meals" | "coach" | "weekly", string>>;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readLast(): LastFired {
  try {
    return JSON.parse(window.localStorage.getItem(LAST_KEY) || "{}") as LastFired;
  } catch {
    return {};
  }
}

function markFired(kind: keyof LastFired) {
  const next = { ...readLast(), [kind]: todayKey() };
  window.localStorage.setItem(LAST_KEY, JSON.stringify(next));
}

function canNotify() {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

function fire(title: string, body: string, kind: keyof LastFired) {
  if (!canNotify()) return false;
  const last = readLast();
  if (last[kind] === todayKey()) return false;
  try {
    new Notification(title, { body, tag: `gym-food-${kind}` });
    markFired(kind);
    return true;
  } catch {
    return false;
  }
}

/** Check reminder windows while the app is open (browser/PWA limitation on iOS). */
export function runNotificationChecks(prefs: NotifyPrefs, ctx: { workoutDone: boolean; mealsLogged: number; mealsTotal: number }) {
  if (!canNotify()) return;
  const hour = new Date().getHours();

  if (prefs.workout && !ctx.workoutDone && hour >= 17) {
    fire("GYM & FOOD", "Hai ancora l’allenamento di oggi da fare.", "workout");
  }
  if (prefs.meals && ctx.mealsLogged < Math.max(1, Math.ceil(ctx.mealsTotal * 0.5)) && hour >= 13 && hour < 16) {
    fire("GYM & FOOD", "Ricorda di aggiornare il diario alimentare.", "meals");
  }
  if (prefs.coach && hour >= 20) {
    fire("GYM & FOOD", "Check-in coach: come ti senti dopo la giornata?", "coach");
  }
  if (prefs.weekly && new Date().getDay() === 0 && hour >= 10) {
    fire("GYM & FOOD", "È domenica: apri la revisione settimanale nei Progressi.", "weekly");
  }
}
