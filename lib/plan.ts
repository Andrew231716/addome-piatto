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

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`;
}

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

function scaleMeal(base: Omit<Meal, "id" | "checked">, factor: number): Meal {
  return {
    id: uid(),
    slot: base.slot,
    name: base.name,
    calories: Math.round(base.calories * factor),
    protein: Math.round(base.protein * factor),
    carbs: Math.round(base.carbs * factor),
    fat: Math.round(base.fat * factor),
    checked: false,
  };
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

function mealPools(diet: DietStyle, cookTime: CookTime): Omit<Meal, "id" | "checked">[] {
  const quick = cookTime === "low";
  const balanced = [
    { slot: "Colazione", name: quick ? "Yogurt greco, banana e avena" : "Porridge proteico e frutti di bosco", calories: 380, protein: 24, carbs: 45, fat: 10 },
    { slot: "Spuntino", name: "Yogurt e mandorle", calories: 210, protein: 17, carbs: 18, fat: 8 },
    { slot: "Pranzo", name: quick ? "Wrap di pollo e verdure" : "Bowl pollo, riso e verdure", calories: 560, protein: 42, carbs: 55, fat: 14 },
    { slot: "Merenda", name: "Pane integrale e ricotta", calories: 190, protein: 13, carbs: 24, fat: 5 },
    { slot: "Cena", name: quick ? "Omelette e insalata" : "Salmone, patate e verdure", calories: 510, protein: 38, carbs: 43, fat: 18 },
  ];
  const highProtein = [
    { slot: "Colazione", name: "Egg white scramble e pane integrale", calories: 360, protein: 32, carbs: 28, fat: 10 },
    { slot: "Spuntino", name: "Skyr e frutti di bosco", calories: 180, protein: 22, carbs: 16, fat: 2 },
    { slot: "Pranzo", name: "Petto di pollo, quinoa e broccoli", calories: 580, protein: 52, carbs: 48, fat: 14 },
    { slot: "Merenda", name: "Frullato proteico", calories: 220, protein: 28, carbs: 18, fat: 4 },
    { slot: "Cena", name: "Merluzzo, zucchine e riso", calories: 480, protein: 44, carbs: 40, fat: 12 },
  ];
  const mediterranean = [
    { slot: "Colazione", name: "Pane, olio EVO, pomodoro e uova", calories: 400, protein: 20, carbs: 38, fat: 18 },
    { slot: "Spuntino", name: "Frutta e noci", calories: 200, protein: 5, carbs: 22, fat: 11 },
    { slot: "Pranzo", name: "Bowl mediterranea con ceci e verdure", calories: 540, protein: 28, carbs: 58, fat: 18 },
    { slot: "Merenda", name: "Yogurt e miele", calories: 170, protein: 12, carbs: 20, fat: 4 },
    { slot: "Cena", name: "Pesce azzurro, farro e insalata", calories: 520, protein: 36, carbs: 45, fat: 20 },
  ];
  const vegetarian = [
    { slot: "Colazione", name: "Porridge cacao, banana e semi", calories: 390, protein: 18, carbs: 55, fat: 12 },
    { slot: "Spuntino", name: "Hummus e carote", calories: 190, protein: 8, carbs: 20, fat: 9 },
    { slot: "Pranzo", name: "Tofu saltato, riso e verdure", calories: 530, protein: 30, carbs: 56, fat: 16 },
    { slot: "Merenda", name: "Yogurt di soia e frutta", calories: 180, protein: 12, carbs: 22, fat: 5 },
    { slot: "Cena", name: "Lenticchie, patate e verdure", calories: 500, protein: 28, carbs: 62, fat: 12 },
  ];
  if (diet === "high_protein") return highProtein;
  if (diet === "mediterranean") return mediterranean;
  if (diet === "vegetarian") return vegetarian;
  return balanced;
}

function shoppingFor(diet: DietStyle): ShoppingItem[] {
  const base =
    diet === "vegetarian"
      ? [
          ["Tofu", "Proteine"],
          ["Lenticchie", "Dispensa"],
          ["Avena", "Dispensa"],
          ["Verdure miste", "Frutta e verdura"],
          ["Yogurt di soia", "Proteine"],
        ]
      : diet === "mediterranean"
        ? [
            ["Pesce azzurro", "Proteine"],
            ["Ceci", "Dispensa"],
            ["Olio EVO", "Dispensa"],
            ["Pomodori", "Frutta e verdura"],
            ["Farro", "Dispensa"],
          ]
        : [
            ["Petto di pollo", "Proteine"],
            ["Yogurt greco", "Proteine"],
            ["Riso integrale", "Dispensa"],
            ["Verdure miste", "Frutta e verdura"],
            ["Uova", "Proteine"],
          ];
  return base.map(([name, category]) => ({ id: uid(), name, category, checked: false }));
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

  if (setup.habitsNotes.toLowerCase().includes("ginocchio") || setup.habitsNotes.toLowerCase().includes("ginocchia")) {
    main = main.map((item) =>
      item.name.toLowerCase().includes("squat")
        ? { ...item, name: "Sit-to-stand da sedia", cue: "Usa una sedia stabile, controlla la discesa.", videoId: "2tFi4qBdQlk" }
        : item,
    );
    focus += " · variante ginocchia protetta";
  }
  if (setup.habitsNotes.toLowerCase().includes("schiena") || setup.habitsNotes.toLowerCase().includes("lombare")) {
    main = main.filter((item) => !item.name.toLowerCase().includes("burpee"));
    focus += " · attenzione zona lombare";
  }

  return {
    workoutTitle: title,
    workoutSummary: summary,
    workoutQueue: [...warmup, ...main, ...cooldown],
    todayActivity,
    focus,
    weekLabel: `Obiettivo: ${GOAL_LABEL[setup.goal]} · ${setup.weeklyGoal} giorni/sett.`,
  };
}

export function buildPlan(setup: UserSetup): GeneratedPlan {
  const calorieTarget = computeCalorieTarget(setup);
  const macros = computeMacros(setup, calorieTarget);
  const pool = mealPools(setup.diet, setup.cookTime);
  const poolTotal = pool.reduce((sum, meal) => sum + meal.calories, 0) || 1;
  const factor = calorieTarget / poolTotal;
  const meals = pool.map((meal) => scaleMeal(meal, factor));
  // Mark breakfast checked by default so diary isn't empty of progress cue
  if (meals[0]) meals[0] = { ...meals[0], checked: true };
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
    shopping: shoppingFor(setup.diet),
    goalLabel: GOAL_LABEL[setup.goal],
    dietLabel: DIET_LABEL[setup.diet],
    ...workout,
  };
}

export function setupSummary(setup: UserSetup) {
  return `${GOAL_LABEL[setup.goal]} · ${setup.weeklyGoal}x/sett. · ${DIET_LABEL[setup.diet]} · ${setup.experience}`;
}
