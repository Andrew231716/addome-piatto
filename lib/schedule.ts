import { buildPlan, expandQueueWithRests, type Exercise, type UserSetup } from './plan';
import { weekDates } from './dates';
export type DayActivity = { kind: 'workout' | 'sport' | 'rest'; label: string; minutes: number };
export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export function defaultTrainingDays(count: number) {
  return ({ 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] } as Record<number, number[]>)[count] ?? [0, 2, 4];
}
export function activityForDate(setup: UserSetup, date: string): DayActivity {
  const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const days = setup.trainingDays ?? defaultTrainingDays(setup.weeklyGoal);
  if (!days.includes(day)) return { kind: 'rest', label: 'Riposo e recupero', minutes: 0 };
  const index = [...days].sort((a,b) => a-b).indexOf(day);
  return { kind: 'workout', label: ['Full body A', 'Gambe e stabilità', 'Full body B'][index % 3], minutes: setup.sessionMinutes ?? 20 };
}
export function sessionForDate(setup: UserSetup, date: string): Exercise[] {
  const activity = activityForDate(setup, date);
  if (activity.kind !== 'workout') return [];
  const base = buildPlan(setup).workoutQueue;
  const work: Exercise[] = [];
  const seconds = setup.experience === 'beginner' ? 25 : 35;
  const make = (id: string, name: string, focus: string, cue: string, videoId: string): Exercise => ({ id, name, focus, cue, videoId, seconds, stage: 'Allenamento' });
  let moves = activity.label === 'Gambe e stabilità' ? [
    make('squat', 'Squat controllato', 'Gambe', 'Scendi solo fin dove mantieni il controllo.', 'aclHk_zu_HY'),
    make('bridge', 'Ponte glutei', 'Glutei', 'Spingi dai talloni senza inarcare la schiena.', 'wPM8icPu6H8'),
    make('bird', 'Bird Dog alternato', 'Stabilità', 'Allunga braccio e gamba opposti senza ruotare il bacino.', 'ZdAHe9_HeEw'),
  ] : activity.label === 'Full body B' ? [
    make('push', 'Push-up al muro o sulle ginocchia', 'Spinta', 'Scegli una variante che ti permetta un movimento controllato.', 'IODxDxX7oiE'),
    make('bridge', 'Ponte glutei', 'Glutei', 'Mantieni il bacino stabile.', 'wPM8icPu6H8'),
    make('dead', 'Dead Bug', 'Core', 'Muovi lentamente, senza perdere il controllo della zona lombare.', '4XLEnwUr1d8'),
  ] : [
    make('squat', 'Squat a corpo libero', 'Gambe', 'Ginocchia in linea con i piedi, movimento controllato.', 'aclHk_zu_HY'),
    make('push', 'Push-up al muro o sulle ginocchia', 'Spinta', 'Scegli una variante adatta al tuo livello.', 'IODxDxX7oiE'),
    make('bird', 'Bird Dog alternato', 'Stabilità', 'Alterna i lati senza ruotare il bacino.', 'ZdAHe9_HeEw'),
  ];
  if (setup.equipment === 'dumbbells') moves = moves.map(m => m.id === 'squat' ? { ...m, name: 'Goblet squat con manubrio', cue: 'Carico leggero davanti al petto; usa il corpo libero se perdi la tecnica.', videoId: 'MeIiIdhvXT4' } : m);
  const warmup = base.filter(e => !e.isRest && e.stage === 'Riscaldamento');
  const cooldown = base.filter(e => !e.isRest && e.stage === 'Stretching');
  const targetSeconds = activity.minutes * 60;
  let queue = expandQueueWithRests([...warmup, ...cooldown], { experience: setup.experience, goal: setup.goal });
  for (let round = 1; round <= 12; round++) {
    const candidate = [...work, ...moves.map(m => ({ ...m, id: `${m.id}-${round}`, set: round }))];
    const expanded = expandQueueWithRests([...warmup, ...candidate, ...cooldown], { experience: setup.experience, goal: setup.goal });
    if (round > 1 && expanded.reduce((s,e) => s+e.seconds, 0) > targetSeconds) break;
    work.push(...moves.map(m => ({ ...m, id: `${m.id}-${round}`, set: round })));
    queue = expanded;
  }
  return queue;
}
export function weekSummary(history: { date: string; workoutDone: boolean }[], today: string, doneToday: boolean) {
  const week = weekDates(today);
  return week.filter(date => date === today ? doneToday : history.some(d => d.date === date && d.workoutDone)).length;
}
