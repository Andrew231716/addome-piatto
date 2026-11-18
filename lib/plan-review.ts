import type { UserSetup, Meal } from "./plan";
import { computeCalorieTarget, computeMacros } from "./plan";

export const PLAN_SOURCES = [
  { label: "Mifflin–St Jeor · metabolismo a riposo", url: "https://pubmed.ncbi.nlm.nih.gov/2305711/" },
  { label: "ACSM 2026 · allenamento con resistenza", url: "https://acsm.org/resistance-training-guidelines-update-2026/" },
  { label: "ISSN · proteine e attività fisica", url: "https://pubmed.ncbi.nlm.nih.gov/28642676/" },
  { label: "CREA · sana alimentazione", url: "https://sapermangiare.an.crea.gov.it/483/linee-guida.html" },
  { label: "CREA · tabelle alimentari", url: "https://www.alimentinutrizione.it/tabelle-nutrizionali/ricerca-per-alimento" },
];
export function maintenanceCalories(setup: UserSetup) {
  const offset = setup.sex === "female" ? -161 : setup.sex === "male" ? 5 : -78;
  const resting = 10 * setup.weight + 6.25 * setup.height - 5 * setup.age + offset;
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[setup.activity];
  return { resting: Math.round(resting), factor, maintenance: Math.round(resting * factor) };
}

export function reviewPlan(setup: UserSetup, meals: Meal[]) {
  const calories = computeCalorieTarget(setup);
  const macros = computeMacros(setup, calories);
  const planned = meals.reduce((sum, item) => ({
    calories: sum.calories + item.calories,
    protein: sum.protein + item.protein,
    carbs: sum.carbs + item.carbs,
    fat: sum.fat + item.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const warnings: string[] = [];
  if (new Set(meals.map(meal => meal.slot)).size < 5) warnings.push("Le esclusioni lasciano alcuni pasti senza una ricetta disponibile. Completa il piano con alternative concordate.");
  if (Math.abs(planned.calories - calories) > calories * .1) warnings.push("Le porzioni del piano si discostano di oltre il 10% dal riferimento energetico. Rivedi gli ingredienti.");
  if (Math.abs(planned.protein - macros.protein) > macros.protein * .2) warnings.push("Le proteine dei pasti si discostano di oltre il 20% dal riferimento. Rivedi porzioni e fonti proteiche.");
  if (setup.sex === "other") warnings.push("Sesso non specificato. La stima usa il punto medio delle due equazioni e richiede una conferma personale.");
  if (setup.age < 19 || setup.age > 78) warnings.push("Età fuori dall’intervallo del campione originale Mifflin–St Jeor. Concorda il riferimento con un professionista.");
  if (setup.goal === "lose_fat" && setup.goalWeight >= setup.weight) warnings.push("Hai scelto perdita di grasso con peso obiettivo uguale o superiore a quello attuale. Controlla la scelta.");
  if (setup.weeklyGoal < 2) warnings.push("La frequenza scelta è inferiore alle due sedute settimanali di resistenza indicate da ACSM.");
  if ((setup.trainingDays ?? []).some(day => setup.trainingDays?.includes((day + 1) % 7))) warnings.push("Hai selezionato giorni consecutivi. Per ripetere una scheda full body concorda recupero e distribuzione con il trainer.");
  return { calories, macros, planned, warnings };
}
