import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { UserSetup } from "@/lib/plan";
import { Input } from "@/components/ui/input";

export type GymDay = "A" | "B" | "C";
export type GymSet = { id: string; date: string; day: GymDay; exercise: string; machine: string; reps: number; load: number };
type Exercise = { machine: string; alternative: string; reps: string; rest: number };

function exercise(machine: string, alternative: string, reps = "10–12", rest = 75): Exercise {
  return { machine, alternative, reps, rest };
}
const plans: Record<GymDay, Exercise[]> = {
  A: [
    exercise("Leg press", "Hack squat", "10–12", 90),
    exercise("Leg curl seduto", "Leg curl sdraiato"),
    exercise("Chest press", "Chest press inclinata"),
    exercise("Low row", "Rematore al cavo"),
    exercise("Lat machine presa neutra", "Lat machine presa larga"),
    exercise("Calf alla macchina", "Calf alla pressa", "12–15", 60),
    exercise("Crunch alla macchina", "Crunch al cavo", "12–15", 60),
  ],
  B: [
    exercise("Hack squat", "Leg press", "10–12", 90),
    exercise("Kickback glutei alla macchina", "Glute machine"),
    exercise("Leg curl sdraiato", "Leg curl seduto"),
    exercise("Chest press inclinata", "Chest press"),
    exercise("Lat machine presa larga", "Lat machine presa neutra"),
    exercise("Shoulder press", "Alzate laterali alla macchina"),
    exercise("Crunch al cavo", "Crunch alla macchina", "12–15", 60),
  ],
  C: [
    exercise("Leg press", "Hack squat", "10–12", 90),
    exercise("Leg extension", "Leg press"),
    exercise("Leg curl seduto", "Leg curl sdraiato"),
    exercise("Pec deck", "Chest press"),
    exercise("Rematore al cavo", "Low row"),
    exercise("Reverse pec deck", "Alzate posteriori al cavo"),
    exercise("Calf alla macchina", "Calf alla pressa", "12–15", 60),
    exercise("Crunch alla macchina", "Crunch al cavo", "12–15", 60),
  ],
};

export function GymTraining({ day, setDay, sets, setSets, date, onComplete, completed, setup }: {
  day: GymDay; setDay: (day: GymDay) => void;
  sets: GymSet[]; setSets: Dispatch<SetStateAction<GymSet[]>>;
  setup: UserSetup; date: string; onComplete: () => void; completed: boolean;
}) {
  const targetSets = setup.experience === "beginner" ? 2 : 3;
  const rest = setup.goal === "endurance" ? 90 : 120;
  const repetitions = setup.goal === "endurance" ? "12–15" : "8–12";
  const exercises = plans[day].slice(0, Math.max(6, Math.min(plans[day].length,
    Math.floor(((setup.sessionMinutes ?? 40) * 60 - 300) / (targetSets * (45 + rest))))));
  const estimatedMinutes = Math.ceil((300 + exercises.length * targetSets * (45 + rest)) / 60);
  const today = sets.filter(set => set.date === date && set.day === day);
  return <section className="surface-card gym-training">
    <h2>Schede solo macchinari</h2>
    <p>{exercises.length} esercizi · {targetSets} serie · circa {estimatedMinutes} min con 5 min di riscaldamento. Disponibilità indicata {setup.sessionMinutes ?? 40} min.</p>
    {estimatedMinutes > (setup.sessionMinutes ?? 40) && <p className="plan-notices">Il tempo selezionato è breve per completare questa scheda full body con recuperi. Aumenta la durata nelle abitudini o concorda una scheda più breve con il trainer.</p>}
    <p>Scegli un carico controllabile, con circa 2–3 ripetizioni ancora possibili alla fine. Conferma tecnica e regolazione delle macchine con il trainer.</p>
    <div className="quick-actions" role="group" aria-label="Seleziona scheda">
      {(["A", "B", "C"] as const).map(item => <button key={item} className={item === day ? "primary-button" : "secondary-button"} aria-pressed={item === day} onClick={() => setDay(item)}>Scheda {item}</button>)}
    </div>
    {exercises.map(item => <MachineEntry targetSets={targetSets} key={day + item.machine} exercise={{...item, reps: repetitions, rest}} sets={sets} today={today} onAdd={(machine, reps, load) => {
      const entry = { id: crypto.randomUUID(), date, day, exercise: item.machine, machine, reps, load };
      setSets(previous => [...previous, entry]);
      toast.success("Serie registrata");
    }} onDelete={id => setSets(previous => previous.filter(set => set.id !== id))} />)}
    <button className="primary-button full" disabled={completed || !today.length} onClick={onComplete}>{completed ? "Seduta completata oggi" : "Completa seduta"}</button>
  </section>;
}

function MachineEntry({ exercise, targetSets, sets, today, onAdd, onDelete }: {
  exercise: Exercise; targetSets: number; sets: GymSet[]; today: GymSet[];
  onAdd: (machine: string, reps: number, load: number) => void;
  onDelete: (id: string) => void;
}) {
  const [machine, setMachine] = useState(exercise.machine);
  const [load, setLoad] = useState("");
  const [reps, setReps] = useState("");
  const last = sets.findLast(set => set.machine === machine);
  const recorded = today.filter(set => set.exercise === exercise.machine);
  const [restEnds, setRestEnds] = useState(0);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((restEnds - now) / 1000));
  const restActive = remaining > 0;
  useEffect(() => {
    if (!restActive) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [restActive]);
  return <details className="gym-exercise">
    <summary><strong>{machine}</strong><span>{recorded.length}/{targetSets} serie · {exercise.reps} rip. · {exercise.rest} s</span></summary>
    <form className="form-stack" onSubmit={event => {
      event.preventDefault();
      onAdd(machine, Number(reps), Number(load));
      const started = Date.now();
      setNow(started);
      setRestEnds(started + exercise.rest * 1000);
    }}>
      <label>Macchinario<select className="setup-select" value={machine} onChange={event => {
        setMachine(event.target.value);
        setLoad("");
      }}><option>{exercise.machine}</option><option>{exercise.alternative}</option></select></label>
      {last && <button type="button" className="secondary-button" onClick={() => { setLoad(String(last.load)); setReps(String(last.reps)); }}>Usa ultima serie · {last.load} kg × {last.reps}</button>}
      <div className="form-grid"><label>Carico (kg)<Input type="number" min={0} max={999} step="any" required value={load} onChange={event => setLoad(event.target.value)} /></label>
      <label>Ripetizioni<Input type="number" min={1} max={100} required value={reps} onChange={event => setReps(event.target.value)} /></label></div>
      <button className="primary-button">Registra serie</button>
    </form>
    {restEnds > 0 && <div className="gym-set"><span role="timer">{remaining > 0 ? `Recupero · ${remaining} s` : "Recupero terminato"}</span><button className="text-button" onClick={() => setRestEnds(0)}>{remaining > 0 ? "Salta recupero" : "Chiudi timer"}</button></div>}
    {recorded.map(set => <div className="gym-set" key={set.id}><span>{set.machine} · {set.load} kg × {set.reps}</span><button className="text-button" onClick={() => onDelete(set.id)}>Rimuovi</button></div>)}
  </details>;
}

export function GymProgress({ sets }: { sets: GymSet[] }) {
  const [selected, setSelected] = useState("");
  const machines = [...new Set(sets.map(set => set.machine))].sort();
  if (!machines.length) return null;
  const machine = machines.includes(selected) ? selected : machines[0];
  const bestByDay: Record<string, GymSet> = {};
  for (const set of sets) {
    if (set.machine === machine && (!bestByDay[set.date] || bestByDay[set.date].load < set.load)) bestByDay[set.date] = set;
  }
  const history = Object.values(bestByDay).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return <section className="surface-card gym-training"><h2>Andamento dei carichi</h2>
    <label>Macchinario<select className="setup-select" value={machine} onChange={event => setSelected(event.target.value)}>{machines.map(name => <option key={name}>{name}</option>)}</select></label>
    <p>Carico maggiore registrato per seduta, con le relative ripetizioni.</p>
    <ul>{history.map(set => <li key={set.id}>{set.date.split("-").reverse().join("/")} · <strong>{set.load} kg × {set.reps}</strong></li>)}</ul>
  </section>;
}
