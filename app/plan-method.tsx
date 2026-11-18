import type { UserSetup, Meal } from "@/lib/plan";
import { PLAN_SOURCES, maintenanceCalories, reviewPlan } from "@/lib/plan-review";

export function PlanMethod({ setup, meals }: { setup: UserSetup; meals: Meal[] }) {
  const review = reviewPlan(setup, meals);
  const energy = maintenanceCalories(setup);
  return <details className="surface-card plan-method">
    <summary>Come è costruito il tuo piano</summary>
    <p>Età {setup.age} anni · {setup.weight} kg · {setup.height} cm · {setup.weeklyGoal} sedute/sett. · {setup.sessionMinutes ?? 20} min · {setup.experience === "beginner" ? "principiante" : setup.experience === "intermediate" ? "intermedio" : "avanzato"}</p>
    <div className="plan-numbers">
      <div><small>Riposo stimato</small><strong>{energy.resting} kcal</strong></div>
      <div><small>Mantenimento stimato</small><strong>{energy.maintenance} kcal</strong></div>
      <div><small>Riferimento giornaliero</small><strong>{review.calories} kcal</strong></div>
      <div><small>Somma dei pasti presenti</small><strong>{review.planned.calories} kcal</strong></div>
    </div>
    <p>Mifflin–St Jeor usa peso, altezza, età e sesso. Il fattore di attività {energy.factor} e la variazione per obiettivo sono ipotesi dell’app. La differenza applicata è {review.calories - energy.maintenance} kcal rispetto al mantenimento stimato. Verifica l’andamento con peso medio, fame, energia e un professionista.</p>
    <p>Proteine di riferimento {review.macros.protein} g · Pasti presenti {review.planned.protein.toFixed(1)} g. Le quantità degli ingredienti sono adattate a energia, proteine, stile alimentare, tempo di cucina e alimenti esclusi.</p>
    <p>Le soglie del controllo automatico sono scelte dell’app. Le fonti sostengono i criteri generali. Un personal trainer o nutrizionista può verificare e correggere il piano individuale. I valori degli alimenti comuni sono indicativi, da confrontare con etichette e tabelle CREA.</p>
    {review.warnings.length > 0 && <ul className="plan-notices">{review.warnings.map(message => <li key={message}>{message}</li>)}</ul>}
    <p>Fonti consultate il 18 novembre 2026</p>
    <ul>{PLAN_SOURCES.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul>
    {setup.habitsNotes && <p>Note da condividere con il professionista · {setup.habitsNotes}</p>}
  </details>;
}
