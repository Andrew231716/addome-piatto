import { plannedMeals, shoppingFromMeals } from "./foods";
import type { Ingredient } from "./foods";
export type GoalType = "lose_fat" | "recomp" | "build_muscle" | "endurance" | "maintain";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";
export type DietStyle = "balanced" | "high_protein" | "mediterranean" | "vegetarian";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Sex = "male" | "female" | "other";
export type CookTime = "low" | "medium" | "high";
export type WorkoutStage = "Riscaldamento" | "Allenamento" | "Stretching";

export type Profile = {
  name: string;
  age: number;
  height: number;
  weight: number;
  goalWeight: number;
  weeklyGoal: number;
};

export type Exercise = {
  id: string;
  name: string;
  focus: string;
  seconds: number;
  stage: WorkoutStage;
  cue: string;
  videoId: string;
  side?: "Sinistra" | "Destra";
  set?: number;
  /** Rest / transition block between work intervals. */
  isRest?: boolean;
};

export type Meal = {
  id: string;
  slot: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  checked: boolean;
  ingredients?: Ingredient[];
  recipeId?: string;
  source?: "recipe" | "manual" | "barcode";
  grams?: number;
  per100?: { calories: number; protein: number; carbs: number; fat: number };
  detail?: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  checked: boolean;
};

export type UserSetup = {
  name: string;
  age: number;
  sex: Sex;
  height: number;
  weight: number;
  goalWeight: number;
  goal: GoalType;
  activity: ActivityLevel;
  experience: Experience;
  weeklyGoal: number;
  diet: DietStyle;
  cookTime: CookTime;
  habitsNotes: string;
  trainingDays?: number[];
  sessionMinutes?: number;
  equipment?: "bodyweight" | "dumbbells";
};

export type GeneratedPlan = {
  profile: Profile;
  calorieTarget: number;
  macros: { protein: number; carbs: number; fat: number };
  meals: Meal[];
  shopping: ShoppingItem[];
  todayActivity: string;
  workoutTitle: string;
  workoutSummary: string;
  workoutQueue: Exercise[];
  focus: string;
  weekLabel: string;
  goalLabel: string;
  dietLabel: string;
};

export const GOAL_OPTIONS: { id: GoalType; label: string; detail: string }[] = [
  { id: "lose_fat", label: "Perdere grasso", detail: "Deficit calorico e sessioni metaboliche" },
  { id: "recomp", label: "Ricomposizione", detail: "Tonificare mantenendo muscolo" },
  { id: "build_muscle", label: "Aumentare muscolo", detail: "Surplus leggero e forza" },
  { id: "endurance", label: "Resistenza", detail: "Più volume e capacità aerobica" },
  { id: "maintain", label: "Mantenimento", detail: "Equilibrio forma e abitudini" },
];

export const ACTIVITY_OPTIONS: { id: ActivityLevel; label: string }[] = [
  { id: "sedentary", label: "Sedentario (poco movimento)" },
  { id: "light", label: "Leggero (1–2 uscite/sett.)" },
  { id: "moderate", label: "Moderato (3–4 uscite/sett.)" },
  { id: "active", label: "Attivo (lavoro fisico / sport frequente)" },
];

export const DIET_OPTIONS: { id: DietStyle; label: string }[] = [
  { id: "balanced", label: "Equilibrata" },
  { id: "high_protein", label: "Alta in proteine" },
  { id: "mediterranean", label: "Mediterranea" },
  { id: "vegetarian", label: "Vegetariana" },
];

export const EXPERIENCE_OPTIONS: { id: Experience; label: string }[] = [
  { id: "beginner", label: "Principiante" },
  { id: "intermediate", label: "Intermedio" },
  { id: "advanced", label: "Avanzato" },
];

export const DEFAULT_SETUP: UserSetup = {
  name: "",
  age: 30,
  sex: "other",
  height: 170,
  weight: 70,
  goalWeight: 68,
  goal: "recomp",
  activity: "light",
  experience: "beginner",
  weeklyGoal: 3,
  diet: "balanced",
  cookTime: "medium",
  habitsNotes: "",
};

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

const GOAL_LABEL: Record<GoalType, string> = Object.fromEntries(GOAL_OPTIONS.map((g) => [g.id, g.label])) as Record<GoalType, string>;
const DIET_LABEL: Record<DietStyle, string> = Object.fromEntries(DIET_OPTIONS.map((d) => [d.id, d.label])) as Record<DietStyle, string>;

function ex(
  id: string,
  name: string,
  focus: string,
  seconds: number,
  stage: WorkoutStage,
  cue: string,
  videoId: string,
  extra: Partial<Exercise> = {},
): Exercise {
  return { id, name, focus, seconds, stage, cue, videoId, ...extra };
}

export function computeCalorieTarget(setup: Pick<UserSetup, "sex" | "weight" | "height" | "age" | "activity" | "goal" | "goalWeight">) {
  const sexOffset = setup.sex === "female" ? -161 : setup.sex === "male" ? 5 : -78;
  const bmr = 10 * setup.weight + 6.25 * setup.height - 5 * setup.age + sexOffset;
  let calories = Math.round(bmr * ACTIVITY_FACTOR[setup.activity]);
  if (setup.goal === "lose_fat") calories -= 400;
  else if (setup.goal === "recomp") calories -= 200;
  else if (setup.goal === "build_muscle") calories += 250;
  else if (setup.goal === "endurance") calories += 100;
  if (setup.goalWeight < setup.weight - 0.5) calories = Math.min(calories, Math.round(bmr * ACTIVITY_FACTOR[setup.activity] - 300));
  if (setup.goalWeight > setup.weight + 0.5) calories = Math.max(calories, Math.round(bmr * ACTIVITY_FACTOR[setup.activity] + 150));
  return Math.max(1400, Math.min(3600, calories));
}

export function computeMacros(setup: UserSetup, calories: number) {
  const proteinPerKg = setup.goal === "build_muscle" || setup.diet === "high_protein" ? 2.0 : setup.goal === "lose_fat" ? 1.9 : 1.6;
  const protein = Math.round(setup.weight * proteinPerKg);
  const fatRatio = setup.diet === "mediterranean" ? 0.32 : 0.27;
  const fat = Math.round((calories * fatRatio) / 9);
  const carbs = Math.max(80, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

function holdSeconds(experience: Experience, base: number) {
  if (experience === "beginner") return Math.max(20, base - 8);
  if (experience === "advanced") return base + 8;
  return base;
}

function setsFor(experience: Experience, goal: GoalType) {
  if (goal === "build_muscle" || experience === "advanced") return 3;
  if (experience === "beginner") return 2;
  return 3;
}

function restSecondsFor(experience: Experience, goal: GoalType, kind: "short" | "set" | "exercise" | "stage") {
  const base =
    kind === "short" ? 12 :
    kind === "set" ? 28 :
    kind === "exercise" ? 35 :
    22;
  if (experience === "beginner") return base + 6;
  if (experience === "advanced" || goal === "endurance") return Math.max(10, base - 6);
  if (goal === "build_muscle") return base + 4;
  return base;
}

function restBlock(
  id: string,
  seconds: number,
  stage: WorkoutStage,
  label: string,
  cue: string,
  videoId = "v0Yj9HjgR64",
): Exercise {
  return {
    id,
    name: label,
    focus: "Recupero attivo",
    seconds,
    stage,
    cue,
    videoId,
    isRest: true,
  };
}

/** Insert rests between work intervals (idempotent if rests already present). */
export function expandQueueWithRests(
  queue: Exercise[],
  opts: { experience?: Experience; goal?: GoalType } = {},
): Exercise[] {
  if (!queue.length) return queue;
  if (queue.some((item) => item.isRest)) return queue;

  const experience = opts.experience ?? "beginner";
  const goal = opts.goal ?? "recomp";
  const out: Exercise[] = [];

  for (let i = 0; i < queue.length; i += 1) {
    const curr = queue[i];
    out.push(curr);
    const next = queue[i + 1];
    if (!next) continue;

    if (curr.stage !== next.stage) {
      out.push(
        restBlock(
          `rest-stage-${i}`,
          restSecondsFor(experience, goal, "stage"),
          next.stage,
          next.stage === "Allenamento" ? "Pausa · inizio sessione" : next.stage === "Stretching" ? "Pausa · stretching" : "Pausa di passaggio",
          "Respira, bevi un sorso d’acqua e preparati al blocco successivo.",
          curr.videoId || next.videoId,
        ),
      );
      continue;
    }

    if (curr.stage !== "Allenamento" || next.stage !== "Allenamento") continue;

    const sameMove = curr.name === next.name;
    const sideFlip = sameMove && curr.side && next.side && curr.side !== next.side && curr.set === next.set;
    const setChange = sameMove && curr.set != null && next.set != null && curr.set !== next.set;
    const exerciseChange = !sameMove;

    if (sideFlip) {
      out.push(
        restBlock(
          `rest-side-${i}`,
          restSecondsFor(experience, goal, "short"),
          "Allenamento",
          "Cambio lato",
          "Cambia lato con calma e riparti con la stessa qualità.",
          next.videoId,
        ),
      );
    } else if (setChange) {
      out.push(
        restBlock(
          `rest-set-${i}`,
          restSecondsFor(experience, goal, "set"),
          "Allenamento",
          `Recupero · serie ${next.set}`,
          "Recupera il respiro. Prossima serie: mantieni il controllo.",
          next.videoId,
        ),
      );
    } else if (exerciseChange) {
      out.push(
        restBlock(
          `rest-ex-${i}`,
          restSecondsFor(experience, goal, "exercise"),
          "Allenamento",
          "Recupero tra esercizi",
          "Scuoti braccia e gambe, poi preparati al prossimo esercizio.",
          next.videoId,
        ),
      );
    }
  }

  return out;
}

function buildWorkout(setup: UserSetup) {
  const hold = (n: number) => holdSeconds(setup.experience, n);
  const sets = setsFor(setup.experience, setup.goal);
  const warmup: Exercise[] = [
    ex("breath", "Respirazione e attivazione", "Diaframma e core", hold(30), "Riscaldamento", "Espira lentamente e attiva l’addome senza forzare.", "v0Yj9HjgR64"),
    ex("catcow", "Cat-Cow", "Mobilità colonna", hold(28), "Riscaldamento", "Muovi la colonna col respiro.", "aPKFmsTrnEg"),
    ex("march", "Marcia sul posto", "Attivazione generale", hold(35), "Riscaldamento", "Alza le ginocchia con ritmo controllato.", "JPaiq9wd7ko"),
  ];

  let main: Exercise[] = [];
  let title = "Sessione full body";
  let summary = "";
  let focus = "Qualità del movimento e costanza";
  let todayActivity = "Full body · 25 min";

  if (setup.goal === "lose_fat" || setup.goal === "recomp") {
    title = setup.goal === "lose_fat" ? "Metabolico + core" : "Tonificazione e core";
    todayActivity = `${title.split(" ")[0]} · ${20 + sets * 4} min`;
    focus = "Deficit sostenibile e controllo del core";
    summary = `${20 + sets * 4} minuti · ${sets} serie principali · intensità ${setup.experience}`;
    main = [
      ex("squat", "Squat a corpo libero", "Gambe e glutei", hold(40), "Allenamento", "Scendi controllato, ginocchia in linea col piede.", "aclHk_zu_HY", { set: 1 }),
      ex("push", "Push-up (o ginocchia)", "Petto e core", hold(35), "Allenamento", "Corpo in linea, non lasciare cadere i fianchi.", "IODxDxX7oiE", { set: 1 }),
      ...Array.from({ length: sets }, (_, i) =>
        ex(`plank-${i + 1}`, "Plank", "Core", hold(30), "Allenamento", "Spingi il pavimento e mantieni il bacino stabile.", "ASdvN_XEl_c", { set: i + 1 }),
      ),
      ...Array.from({ length: sets }, (_, i) => [
        ex(`side-l-${i + 1}`, "Side Plank", "Obliqui", hold(25), "Allenamento", "Bacino alto, spalla sopra il gomito.", "Oe9Tp9SvTCE", { side: "Sinistra" as const, set: i + 1 }),
        ex(`side-r-${i + 1}`, "Side Plank", "Obliqui", hold(25), "Allenamento", "Respira e non far cadere il bacino.", "Oe9Tp9SvTCE", { side: "Destra" as const, set: i + 1 }),
      ]).flat(),
      ex("deadbug", "Dead Bug", "Core profondo", hold(40), "Allenamento", "Mantieni la zona lombare stabile.", "4XLEnwUr1d8", { set: 1 }),
    ];
  } else if (setup.goal === "build_muscle") {
    title = "Forza a corpo libero";
    todayActivity = `Forza · ${24 + sets * 5} min`;
    focus = "Tensione muscolare e progressione delle serie";
    summary = `${24 + sets * 5} minuti · enfasi forza · ${sets} serie`;
    main = [
      ...Array.from({ length: sets }, (_, i) => ex(`squat-${i + 1}`, "Squat lento", "Quadricipiti e glutei", hold(45), "Allenamento", "3 secondi in discesa, spingi sui talloni.", "aclHk_zu_HY", { set: i + 1 })),
      ...Array.from({ length: sets }, (_, i) => ex(`row-${i + 1}`, "Superman hold", "Dorsali e posteriori", hold(35), "Allenamento", "Solleva petto e gambe senza comprimere il collo.", "cc6UVRS7PW4", { set: i + 1 })),
      ...Array.from({ length: sets }, (_, i) => ex(`push-${i + 1}`, "Push-up controllato", "Petto e tricipiti", hold(40), "Allenamento", "Tempo lento, range completo.", "IODxDxX7oiE", { set: i + 1 })),
      ex("glute", "Bridge glutei", "Glutei", hold(40), "Allenamento", "Spremi i glutei in alto senza inarcare la schiena.", "OUgsJNykxhI", { set: 1 }),
      ex("plank", "Plank", "Core", hold(35), "Allenamento", "Corpo lungo e stabile.", "ASdvN_XEl_c", { set: 1 }),
    ];
  } else if (setup.goal === "endurance") {
    title = "Resistenza e capacità";
    todayActivity = "Resistenza · 28 min";
    focus = "Ritmo costante e recupero attivo";
    summary = "28 minuti · densità alta · recupero breve";
    main = [
      ex("jog", "Skip alti", "Cardio", hold(40), "Allenamento", "Ritmo costante, braccia attive.", "R0mMyV5OtcM", { set: 1 }),
      ex("squat-pulse", "Squat pulse", "Gambe", hold(40), "Allenamento", "Piccole pulsazioni a metà range.", "aclHk_zu_HY", { set: 1 }),
      ex("mountain", "Mountain climber lento", "Core e cardio", hold(35), "Allenamento", "Mantieni le spalle sopra i polsi.", "cnyTQDSEXlQ", { set: 1 }),
      ...Array.from({ length: sets }, (_, i) => ex(`burpee-${i + 1}`, "Burpee senza salto", "Full body", hold(30), "Allenamento", "Passo indietro controllato, risali fluidi.", "auBLPXO4P00", { set: i + 1 })),
      ex("plank", "Plank", "Core", hold(35), "Allenamento", "Respira e resta lungo.", "ASdvN_XEl_c", { set: 1 }),
    ];
  } else {
    title = "Equilibrio e mobilità";
    todayActivity = "Equilibrio · 22 min";
    focus = "Mantenimento della forma e abitudini";
    summary = "22 minuti · tecnica e mobilità";
    main = [
      ex("squat", "Squat", "Gambe", hold(35), "Allenamento", "Movimento pulito e completo.", "aclHk_zu_HY", { set: 1 }),
      ex("push", "Push-up assistito", "Parte superiore", hold(30), "Allenamento", "Qualità prima della quantità.", "IODxDxX7oiE", { set: 1 }),
      ex("bird", "Bird Dog", "Core e schiena", hold(40), "Allenamento", "Allunga senza ruotare il bacino.", "ZdAHe9_HeEw", { set: 1 }),
      ...Array.from({ length: Math.max(2, sets - 1) }, (_, i) => ex(`plank-${i + 1}`, "Plank", "Core", hold(28), "Allenamento", "Spalle lontane dalle orecchie.", "ASdvN_XEl_c", { set: i + 1 })),
    ];
  }

  const cooldown: Exercise[] = [
    ex("cobra", "Cobra dolce", "Addome anteriore", hold(28), "Stretching", "Solleva il petto solo fin dove resta comodo.", "JDcdhTuycOI"),
    ex("child", "Child’s pose", "Schiena e fianchi", hold(30), "Stretching", "Bacino indietro, braccia lunghe.", "py-qXCuFzaA"),
    ex("breath-down", "Respirazione diaframmatica", "Recupero", hold(35), "Stretching", "Inspira dal naso, espira lentamente.", "v0Yj9HjgR64"),
  ];

  const notes = setup.habitsNotes.toLowerCase();
  if (notes.includes("ginocchio") || notes.includes("ginocchia")) {
    main = main.map((item) =>
      item.name.toLowerCase().includes("squat")
        ? { ...item, name: "Sit-to-stand da sedia", cue: "Usa una sedia stabile, controlla la discesa.", videoId: "2tFi4qBdQlk" }
        : item,
    );
    focus += " · variante ginocchia protetta";
  }
  if (notes.includes("schiena") || notes.includes("lombare")) {
    main = main.filter((item) => !item.name.toLowerCase().includes("burpee"));
    focus += " · attenzione zona lombare";
  }
  if (notes.includes("latticin") || notes.includes("lattosio") || notes.includes("dairy")) {
    focus += " · senza latticini nel piano pasti";
  }
  if (notes.includes("vegetar") || notes.includes("plant")) {
    focus += " · focus vegetariano";
  }
  if (notes.includes("spalla") || notes.includes("polso")) {
    main = main.map((item) =>
      item.name.toLowerCase().includes("push-up")
        ? { ...item, name: "Wall push-up", cue: "Mani al muro, corpo lungo, range indolore.", videoId: "IODxDxX7oiE" }
        : item,
    );
    focus += " · push-up a muro";
  }
  if (notes.includes("sedentar") || notes.includes("poco movimento")) {
    main = main.map((item) => (item.isRest ? item : { ...item, seconds: Math.max(16, item.seconds - 6) }));
    focus += " · volume ridotto per ripresa";
  }

  return {
    workoutTitle: title,
    workoutSummary: summary,
    workoutQueue: expandQueueWithRests([...warmup, ...main, ...cooldown], {
      experience: setup.experience,
      goal: setup.goal,
    }),
    todayActivity,
    focus,
    weekLabel: `Obiettivo: ${GOAL_LABEL[setup.goal]} · ${setup.weeklyGoal} giorni/sett.`,
  };
}

export function buildPlan(setup: UserSetup): GeneratedPlan {
  const calorieTarget = computeCalorieTarget(setup);
  const macros = computeMacros(setup, calorieTarget);
  const meals = plannedMeals(setup.diet, calorieTarget);
  const workout = buildWorkout(setup);

  return {
    profile: {
      name: setup.name.trim() || "Atleta",
      age: setup.age,
      height: setup.height,
      weight: setup.weight,
      goalWeight: setup.goalWeight,
      weeklyGoal: setup.weeklyGoal,
    },
    calorieTarget,
    macros,
    meals,
    shopping: shoppingFromMeals(meals),
    goalLabel: GOAL_LABEL[setup.goal],
    dietLabel: DIET_LABEL[setup.diet],
    ...workout,
  };
}

export function setupSummary(setup: UserSetup) {
  return `${GOAL_LABEL[setup.goal]} · ${setup.weeklyGoal}x/sett. · ${DIET_LABEL[setup.diet]} · ${setup.experience}`;
}
