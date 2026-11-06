"use client";
import { backupSchema } from "@/lib/backup";
import { CloudAccountPanel } from "./cloud-account";
import { pushCloud, pullCloud } from "@/lib/cloud";
import { idbPut } from "@/lib/idb";

import { NutritionDiary } from "./nutrition";
import { WeeklyPlanner } from "./weekly-planner";
import { localDate, shiftDate, weekDates } from "@/lib/dates";
import { archiveDay, weightTrend, type DayRecord } from "@/lib/history";
import { activityForDate, sessionForDate, defaultTrainingDays, weekSummary, type DayActivity } from "@/lib/schedule";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bot, Camera, Check, ChevronRight,
  CirclePlay, Clock3, Download, Dumbbell, Flame, Footprints, HeartPulse, Home,
  MessageCircle, Minus, Pause, Play, Plus, RefreshCw, RotateCcw, Search,
  Send, Settings2, Sparkles, Square, Star, Target, TimerReset, Trash2,
  TrendingDown, Upload, UserRound, Utensils, Video, Volume2, VolumeX, Watch, X, Bell,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast, Toaster } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  changePassword,
  deleteAccount,
  getSession,
  loginAccount,
  logoutAccount,
  migrateLegacyGuest,
  readLegacyLocalProfile,
  registerAccount,
  recoverAccount,
  type Session,
  updateAccountName,
} from "@/lib/auth";
import { loadUserValue, saveUserValue } from "@/lib/user-data";
import { runNotificationChecks } from "@/lib/notifications";
import { SetupWizard } from "@/app/setup-wizard";
import { GuidedWorkout } from "@/app/guided-workout";
import { adaptQueueByDifficulty, adaptQueueByFeedback, shortenHolds, swapSidePlankForBirdDog } from "@/lib/adapt-workout";
import {
  buildPlan,
  computeCalorieTarget,
  computeMacros,
  expandQueueWithRests,
  setupSummary,
  type Exercise,
  type Meal,
  type Profile,
  type ShoppingItem,
  type UserSetup,
  type WorkoutStage,
} from "@/lib/plan";

type TabKey = "home" | "workouts" | "nutrition" | "progress" | "coach" | "profile";
type CoachMessage = { id: string; role: "user" | "coach"; text: string };
type WorkoutMeta = { title: string; summary: string; focus: string; weekLabel: string; goalLabel: string; dietLabel: string };
type ProgressMetrics = {
  waist: number;
  workoutsCompleted: number;
  streakDays: number;
  lastWorkoutDate: string;
  photoDataUrl: string | null;
};
type Recipe = { id: string; name: string; time: string; calories: number; protein: number; carbs: number; fat: number; tags: string[]; slot: string };

const DAY_NAMES = ["DOMENICA", "LUNEDÌ", "MARTEDÌ", "MERCOLEDÌ", "GIOVEDÌ", "VENERDÌ", "SABATO"] as const;
const MONTH_NAMES = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"] as const;

function formatTopbarDate(date = new Date()) {
  return {
    weekday: DAY_NAMES[date.getDay()],
    label: `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`,
  };
}

function todayIso() {
  return localDate();
}

function macroTargets(setup: UserSetup | null, profile: Profile) {
  if (setup) { const current = { ...setup, ...profile }; return computeMacros(current, computeCalorieTarget(current)); }
  const calories = Math.round(10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5);
  const protein = Math.round(profile.weight * 1.8);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(80, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

const MOBILE_NAV: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Oggi", icon: Home },
  { key: "workouts", label: "Workout", icon: Dumbbell },
  { key: "nutrition", label: "Cibo", icon: Utensils },
  { key: "progress", label: "Progressi", icon: BarChart3 },
  { key: "coach", label: "Coach", icon: MessageCircle },
];

const NAV: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Oggi", icon: Home },
  { key: "workouts", label: "Allenamenti", icon: Dumbbell },
  { key: "nutrition", label: "Alimentazione", icon: Utensils },
  { key: "progress", label: "Progressi", icon: BarChart3 },
  { key: "coach", label: "Coach", icon: MessageCircle },
  { key: "profile", label: "Profilo", icon: UserRound },
];

const TAB_PATHS: Record<TabKey, string> = {
  home: "/",
  workouts: "/allenamenti",
  nutrition: "/alimentazione",
  progress: "/progressi",
  coach: "/coach",
  profile: "/profilo",
};

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function pathToTab(pathname: string): TabKey | null {
  const current = normalizePath(pathname);
  const match = (Object.entries(TAB_PATHS) as [TabKey, string][]).find(([, path]) => path === current);
  return match?.[0] ?? null;
}

function useTabNavigation() {
  const [tab, setTabState] = useState<TabKey>("home");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const fromPath = pathToTab(window.location.pathname);
    if (fromPath) {
      setTabState(fromPath);
    } else {
      try {
        const saved = window.localStorage.getItem("addome-tab");
        if (saved) {
          const parsed = JSON.parse(saved) as TabKey;
          if (parsed in TAB_PATHS) setTabState(parsed);
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    setHydrated(true);

    const onPopState = () => {
      const next = pathToTab(window.location.pathname);
      if (next) setTabState(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("addome-tab", JSON.stringify(tab));
    const path = TAB_PATHS[tab];
    if (normalizePath(window.location.pathname) !== path) {
      window.history.replaceState({ tab }, "", path);
    }
  }, [hydrated, tab]);

  const setTab = (key: TabKey) => {
    setTabState(key);
    const path = TAB_PATHS[key];
    if (normalizePath(window.location.pathname) !== path) {
      window.history.pushState({ tab: key }, "", path);
    }
  };

  return [tab, setTab] as const;
}

const WARMUP: Exercise[] = [
  { id: "breath", name: "Respirazione e attivazione del core", focus: "Diaframma e addome profondo", seconds: 35, stage: "Riscaldamento", cue: "Espira lentamente e avvicina l’ombelico alla colonna senza spingere fuori l’addome.", videoId: "v0Yj9HjgR64" },
  { id: "catcow", name: "Cat-Cow", focus: "Colonna e core", seconds: 30, stage: "Riscaldamento", cue: "Muovi la colonna con il respiro senza forzare collo o zona lombare.", videoId: "aPKFmsTrnEg" },
  { id: "pelvic", name: "Retroversione del bacino", focus: "Addome profondo e bacino", seconds: 30, stage: "Riscaldamento", cue: "Appiattisci dolcemente la zona lombare attivando l’addome.", videoId: "JPaiq9wd7ko" },
];

const MAIN_EXERCISES: Exercise[] = [
  { id: "deadbug-1", name: "Dead Bug", focus: "Core profondo e stabilità lombare", seconds: 40, stage: "Allenamento", cue: "Mantieni la zona lombare stabile mentre estendi lentamente braccio e gamba opposti.", videoId: "4XLEnwUr1d8", set: 1 },
  { id: "crunch-1", name: "Crunch controllato", focus: "Retto addominale", seconds: 35, stage: "Allenamento", cue: "Solleva le scapole usando l’addome e lascia il collo rilassato.", videoId: "Xyd_fa5zoEU", set: 1 },
  ...[1, 2, 3].flatMap((set) => [
    { id: `side-left-${set}`, name: "Side Plank", focus: "Obliqui e core laterale", seconds: 30, stage: "Allenamento" as WorkoutStage, cue: "Spingi l’avambraccio a terra e mantieni il bacino in linea con spalle e piedi.", videoId: "Oe9Tp9SvTCE", side: "Sinistra" as const, set },
    { id: `side-right-${set}`, name: "Side Plank", focus: "Obliqui e core laterale", seconds: 30, stage: "Allenamento" as WorkoutStage, cue: "Respira regolarmente e non lasciare cadere il bacino durante la tenuta.", videoId: "Oe9Tp9SvTCE", side: "Destra" as const, set },
  ]),
  { id: "birddog-1", name: "Bird Dog", focus: "Core e stabilizzatori della schiena", seconds: 40, stage: "Allenamento", cue: "Allunga gli arti opposti senza ruotare il bacino.", videoId: "ZdAHe9_HeEw", set: 1 },
];

const COOLDOWN: Exercise[] = [
  { id: "cobra", name: "Cobra dolce", focus: "Addome e parte anteriore del tronco", seconds: 30, stage: "Stretching", cue: "Solleva il petto solo fin dove l’allungamento resta confortevole.", videoId: "JDcdhTuycOI" },
  { id: "child-side-left", name: "Child’s pose laterale", focus: "Obliqui e dorsali", seconds: 30, stage: "Stretching", cue: "Porta le mani a destra mantenendo il bacino indietro e respira lentamente.", videoId: "py-qXCuFzaA", side: "Sinistra" },
  { id: "child-side-right", name: "Child’s pose laterale", focus: "Obliqui e dorsali", seconds: 30, stage: "Stretching", cue: "Porta le mani a sinistra mantenendo il bacino indietro e respira lentamente.", videoId: "py-qXCuFzaA", side: "Destra" },
  { id: "breath-down", name: "Respirazione diaframmatica", focus: "Recupero e rilassamento del core", seconds: 40, stage: "Stretching", cue: "Inspira dal naso ed espira lentamente lasciando rilassare l’addome.", videoId: "v0Yj9HjgR64" },
];

const WORKOUT_QUEUE = expandQueueWithRests([...WARMUP, ...MAIN_EXERCISES, ...COOLDOWN], {
  experience: "beginner",
  goal: "recomp",
});
const DEFAULT_MEALS: Meal[] = [
  { id: "m1", slot: "Colazione", name: "Porridge proteico e frutti di bosco", calories: 380, protein: 24, carbs: 45, fat: 10, checked: true },
  { id: "m2", slot: "Spuntino", name: "Yogurt greco, mela e mandorle", calories: 210, protein: 17, carbs: 22, fat: 7, checked: true },
  { id: "m3", slot: "Pranzo", name: "Bowl mediterranea con pollo e riso", calories: 560, protein: 42, carbs: 55, fat: 14, checked: false },
  { id: "m4", slot: "Merenda", name: "Pane integrale e ricotta", calories: 190, protein: 13, carbs: 24, fat: 5, checked: false },
  { id: "m5", slot: "Cena", name: "Salmone, patate e verdure", calories: 510, protein: 38, carbs: 43, fat: 18, checked: false },
];
const DEFAULT_SHOPPING: ShoppingItem[] = [
  { id: "s1", name: "Petto di pollo", category: "Proteine", checked: false },
  { id: "s2", name: "Yogurt greco", category: "Proteine", checked: true },
  { id: "s3", name: "Riso integrale", category: "Dispensa", checked: false },
  { id: "s4", name: "Avocado", category: "Frutta e verdura", checked: false },
  { id: "s5", name: "Pomodorini", category: "Frutta e verdura", checked: false },
];
const RECIPES: Recipe[] = [
  { id: "r1", name: "Bowl mediterranea proteica", time: "22 min", calories: 540, protein: 41, carbs: 52, fat: 16, tags: ["Alta in proteine", "Pranzo"], slot: "Pranzo" },
  { id: "r2", name: "Piadina integrale con tacchino", time: "12 min", calories: 430, protein: 35, carbs: 38, fat: 14, tags: ["Veloce", "Cena"], slot: "Cena" },
  { id: "r3", name: "Porridge cacao e banana", time: "8 min", calories: 390, protein: 26, carbs: 48, fat: 10, tags: ["Colazione", "Vegetariana"], slot: "Colazione" },
];
const DEFAULT_METRICS: ProgressMetrics = {
  waist: 84,
  workoutsCompleted: 15,
  streakDays: 12,
  lastWorkoutDate: "",
  photoDataUrl: null,
};
const HEART_SEED = [{ label: "Lun", rest: 64, workout: 128 }, { label: "Mar", rest: 63, workout: 134 }, { label: "Mer", rest: 62, workout: 131 }, { label: "Gio", rest: 62, workout: 139 }, { label: "Ven", rest: 61, workout: 136 }, { label: "Sab", rest: 61, workout: 142 }, { label: "Oggi", rest: 60, workout: 137 }];

function useUserState<T>(userId: string, key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  const saved = useRef<string>("");
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    loadUserValue(userId, key, fallback).then((loaded) => {
      if (!cancelled) {
        saved.current = JSON.stringify(loaded);
        setValue(loaded);
        setReady(true);
      }
    }).catch(() => toast.error('Impossibile leggere i dati locali. Riapri l’app senza cancellare i dati del browser.'));
    return () => { cancelled = true; };
  }, [userId, key]);
  useEffect(() => {
    if (ready && JSON.stringify(value) !== saved.current) {
      saved.current = JSON.stringify(value);
      void saveUserValue(userId, key, value).catch(() => { saved.current = ''; toast.error('Salvataggio nel dispositivo non riuscito. Esporta un backup prima di chiudere.'); });
    }
  }, [userId, key, ready, value]);
  return [value, setValue, ready] as const;
}

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatTimer(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function bmi(profile: Profile) { const meters = profile.height / 100; return profile.weight / (meters * meters); }
function calorieTarget(profile: Profile, setup: UserSetup | null = null) {
  if (setup) return computeCalorieTarget({ ...setup, ...profile });
  const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5;
  return Math.round(bmr * 1.42 - 380);
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState(readLegacyLocalProfile()?.name ?? "");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const legacy = readLegacyLocalProfile();

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const session =
        mode === "recover" ? await recoverAccount({ email, password, recoveryCode }) : mode === "login"
          ? await loginAccount({ email, password })
          : await registerAccount({ email, name: name || email.split("@")[0] || "Atleta", password });
      onAuthenticated(session);
      toast.success(mode === "login" ? "Accesso effettuato" : "Account creato");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operazione non riuscita";
      setError(message);
      if (mode === "login" && message.toLowerCase().includes("non trovato")) {
        // Keep credentials visible and nudge toward registration on this device.
        setMode("register");
      }
    } finally {
      setBusy(false);
    }
  };

  const restoreLegacy = async () => {
    setBusy(true);
    setError("");
    try {
      const session = await migrateLegacyGuest();
      if (!session) throw new Error("Nessun dato locale da ripristinare.");
      onAuthenticated(session);
      toast.success("Sessione locale ripristinata. Usa la password scelta in fase di migrazione oppure reimposta da Profilo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ripristino non riuscito");
    } finally {
      setBusy(false);
    }
  };

  const goToLogin = () => {
    setMode("login");
    setError("");
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {mode === "register" && (
          <button
            type="button"
            className="auth-back"
            onClick={goToLogin}
            aria-label="Torna ad Accedi"
          >
            <ArrowLeft size={18} />
            <span>Accedi</span>
          </button>
        )}
        <div className="auth-brand">
          <span className="brand-mark"><img src="/favicon.svg" alt="" className="brand-mark-img" width={44} height={44} /></span>
          <strong><b>GYM</b><i>&</i><b>FOOD</b></strong>
<p>Allenamenti, alimentazione e progressi, anche tra dispositivi diversi.</p>
        </div>
        <div className="segment-control auth-toggle">
          <button className={mode === "login" ? "active" : ""} onClick={goToLogin}>Accedi</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Crea account</button>
        </div>
        <div className="form-stack">
          {mode === "register" && (
            <label>Nome
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Il tuo nome" />
            </label>
          )}
          <label>Email
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" />
          </label>
          <label>Password
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "La tua password" : "Almeno 10 caratteri"} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} />
          </label>
          {mode === "recover" && <label>Codice di recupero<Input value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} autoComplete="off" /></label>}
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button full" disabled={busy} onClick={() => void submit()}>
            {busy ? "Attendere…" : mode === "login" ? "Entra" : mode === "recover" ? "Recupera account" : "Registrati"}
          </button>
          <button className="text-button" onClick={()=>{setMode("recover");setError("");}}>Password dimenticata? Usa il codice di recupero</button>
          {legacy && (
            <button className="secondary-button full" disabled={busy} onClick={() => void restoreLegacy()}>
              Ripristina dati locali di {legacy.name}
            </button>
          )}
        </div>
        <p className="auth-note">Dati disponibili nel dispositivo e backup cloud cifrato. Per il recupero conserva il codice fornito alla registrazione.</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await getSession();
      if (current?.remote && localStorage.getItem(`gym-cloud-dirty:${current.accountId}`) !== 'true') {
        try { await pullCloud(current); } catch { /* preserve offline local access */ }
      }
      if (!cancelled) {
        setSession(current);
        setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (bootstrapping) {
    return <div className="auth-shell"><div className="auth-card"><p>Caricamento GYM & FOOD…</p></div></div>;
  }
  if (!session) {
    return (
      <>
        <AuthScreen onAuthenticated={setSession} />
        <Toaster position="top-center" richColors />
      </>
    );
  }
  return <AuthenticatedApp session={session} onSessionChange={setSession} />;
}

function AuthenticatedApp({ session, onSessionChange }: { session: Session; onSessionChange: (session: Session | null) => void }) {
  const [tab, setTab] = useTabNavigation();
  const [setup, setSetup, setupHydrated] = useUserState<UserSetup | null>(session.accountId, "gf2-setup", null);
  const [onboarded, setOnboarded, onboardedReady] = useUserState(session.accountId, "gf2-onboarded", false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [profile, setProfile, profileReady] = useUserState<Profile>(session.accountId, "gf2-profile", {
    name: session.name,
    age: 30,
    height: 170,
    weight: 70,
    goalWeight: 68,
    weeklyGoal: 3,
  });
  const [meals, setMeals, mealsReady] = useUserState<Meal[]>(session.accountId, "gf2-meals", []);
  const [shopping, setShopping] = useUserState<ShoppingItem[]>(session.accountId, "gf2-shopping", []);
  const [weightData, setWeightData, weightDataReady] = useUserState(session.accountId, "gf2-weight", [{ date: "Oggi", value: 70 }]);
  const [completedWorkout, setCompletedWorkout, completedWorkoutReady] = useUserState(session.accountId, "gf2-workout-done", false);
  const [water, setWater, waterReady] = useUserState(session.accountId, "gf2-water", 0);
  const [steps, setSteps, stepsReady] = useUserState(session.accountId, "gf2-steps", 0);
  const [voiceEnabled, setVoiceEnabled] = useUserState(session.accountId, "gf2-voice", true);
  const [todayActivity, setTodayActivity] = useUserState<string>(session.accountId, "gf2-today-activity", "Configura il piano");
  const [workoutQueue, setWorkoutQueue, workoutQueueReady] = useUserState<Exercise[]>(session.accountId, "gf2-workout-queue", WORKOUT_QUEUE);
  const [workoutMeta, setWorkoutMeta, workoutMetaReady] = useUserState<WorkoutMeta>(session.accountId, "gf2-workout-meta", {
    title: "Il tuo allenamento",
    summary: "Completa la configurazione per generare la sessione",
    focus: "Definisci obiettivo e abitudini",
    weekLabel: "Piano non ancora configurato",
    goalLabel: "—",
    dietLabel: "—",
  });
  const [metrics, setMetrics, metricsReady] = useUserState<ProgressMetrics>(session.accountId, "gf2-metrics", {
    waist: 0,
    workoutsCompleted: 0,
    streakDays: 0,
    lastWorkoutDate: "",
    photoDataUrl: null,
  });
  const [coachMessages, setCoachMessages, coachMessagesReady] = useUserState<CoachMessage[]>(session.accountId, "gf2-coach", []);
  const [dayKey, setDayKey, dayKeyReady] = useUserState<string>(session.accountId, "gf2-day-key", "");
  const [autoAdapt, setAutoAdapt] = useUserState(session.accountId, "gf2-auto-adapt", true);
  const [lastFeedback, setLastFeedback] = useUserState<string>(session.accountId, "gf2-last-feedback", "");
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [history, setHistory, historyReady] = useUserState<DayRecord[]>(session.accountId, "gf3-history", []);
  const [overrides, setOverrides, overridesReady] = useUserState<Record<string,DayActivity>>(session.accountId, "gf3-overrides", {});
  const [queueDate, setQueueDate, queueDateReady] = useUserState(session.accountId, "gf3-queue-date", "");
  const dataReady = setupHydrated && onboardedReady && profileReady && mealsReady && weightDataReady && completedWorkoutReady && waterReady && stepsReady && metricsReady && dayKeyReady && historyReady && overridesReady && queueDateReady && workoutQueueReady && workoutMetaReady && coachMessagesReady;
  const [cloudStatus, setCloudStatus] = useState(session.remote ? "Cloud pronto" : "Solo dispositivo");
  const [clock, setClock] = useState(() => new Date());
  const consumed = meals.filter((meal) => meal.checked).reduce((sum, meal) => sum + meal.calories, 0);
  const target = calorieTarget(profile, setup);
  const topbarDate = formatTopbarDate(clock);
  const macros = macroTargets(setup, profile);
  const setupReady = onboarded && !!setup;
  const effectiveSetup = setup ? { ...setup, ...profile, trainingDays: setup.trainingDays?.length === profile.weeklyGoal ? setup.trainingDays : defaultTrainingDays(profile.weeklyGoal) } : null;
  const todayActivityPlan = effectiveSetup ? overrides[todayIso()] ?? activityForDate(effectiveSetup, todayIso()) : null;
  const actualMinutes = Math.ceil(workoutQueue.reduce((sum,item)=>sum+item.seconds,0)/60);
  const displayMeta = { ...workoutMeta, title: todayActivityPlan?.label ?? workoutMeta.title, summary: todayActivityPlan?.kind === 'workout' ? `${actualMinutes} min · sessione guidata` : todayActivityPlan?.kind === 'sport' ? `${todayActivityPlan.minutes} min · attività libera` : 'Giornata di recupero' };
  const weekCompleted = weekSummary(history, todayIso(), completedWorkout);
  const currentActivity = todayActivityPlan?.label ?? todayActivity;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dataReady) return;
    const today = todayIso();
    if (!dayKey) {
      setDayKey(today);
      return;
    }
    if (dayKey === today) return;
    setHistory(archiveDay(history, { date: dayKey, meals, water, steps, workoutDone: completedWorkout, activity: todayActivity, target, weight: profile.weight }));
    setDayKey(today);
    setCompletedWorkout(false);
    setWater(0);
    setSteps(0);
    if (effectiveSetup) setMeals(buildPlan(effectiveSetup).meals);
    else setMeals(meals.map((meal) => ({ ...meal, checked: false })));
    toast.message("Nuovo giorno", { description: "Giornata precedente archiviata. Il diario di oggi è pronto." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, dayKey, dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    if (profile.name !== session.name) {
      void updateAccountName(session.accountId, profile.name).then((next) => {
        if (next) onSessionChange(next);
      }).catch(() => toast.error("Nome salvato nel dispositivo; aggiorna il cloud quando sei online."));
    }
  }, [dataReady, profile.name, session.accountId, session.name, onSessionChange]);

  useEffect(() => {
    if (!dataReady) return;
    const last = weightData.at(-1);
    if (!last || Math.abs(last.value - profile.weight) < 0.05) return;
    const today = todayIso();
    if (last.date === today || last.date.startsWith(today)) {
      setWeightData([...weightData.slice(0, -1), { date: today, value: profile.weight }]);
    } else {
      setWeightData([...weightData, { date: today, value: profile.weight }]);
    }
  }, [profile.weight, dataReady]); // intentionally narrow: avoid loops on weightData identity

  useEffect(() => {
    if (!dataReady || !effectiveSetup || dayKey !== todayIso()) return;
    const activity = overrides[todayIso()] ?? activityForDate(effectiveSetup, todayIso());
    const activityKey = `${todayIso()}:${activity.kind}:${activity.label}:${activity.minutes}`;
    if (queueDate === activityKey) return;
    setWorkoutQueue(activity.kind === 'workout' ? sessionForDate(effectiveSetup, todayIso()) : []);
    setTodayActivity(activity.label);
    setQueueDate(activityKey);
  }, [dataReady, dayKey, clock, overrides, setup, queueDate]);

  const startToday = () => {
    if (todayActivityPlan?.kind === 'rest') { toast.message('Oggi è previsto recupero. Puoi cambiare attività dal calendario.'); return; }
    if (todayActivityPlan?.kind === 'sport') { markWorkoutComplete(); toast.success('Attività libera registrata'); return; }
    if (!workoutQueue.length) { toast.message('La sessione si sta preparando. Riprova tra un momento.'); return; }
    setWorkoutOpen(true);
  };

  useEffect(() => {
    if (!session.remote || !dataReady) return;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    let generation = 0;
    const save = () => {
      generation++;
      localStorage.setItem(`gym-cloud-dirty:${session.accountId}`, 'true');
      setCloudStatus('Modifiche da salvare');
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!navigator.onLine) { setCloudStatus('Offline · dati nel dispositivo'); return; }
        const version = generation;
        setCloudStatus('Salvataggio cloud…');
        void pushCloud(session).then(() => {
          if (version === generation) localStorage.removeItem(`gym-cloud-dirty:${session.accountId}`);
          if (active) setCloudStatus('Salvato sul cloud');
        }).catch(error => { if(active) setCloudStatus(error instanceof Error ? error.message : 'Cloud non disponibile'); });
      }, 2500);
    };
    const changed = (event: Event) => { if ((event as CustomEvent).detail === session.accountId) save(); };
    const online = () => { if(localStorage.getItem(`gym-cloud-dirty:${session.accountId}`) === 'true') save(); };
    window.addEventListener('gym-data-saved',changed);
    window.addEventListener('online',online);
    if(localStorage.getItem(`gym-cloud-dirty:${session.accountId}`) === 'true') save();
    return () => { active=false;clearTimeout(timer);window.removeEventListener('gym-data-saved',changed);window.removeEventListener('online',online); };
  }, [session.accountId, session.remote, dataReady]);

  const applySetup = (nextSetup: UserSetup) => {
    const plan = buildPlan(nextSetup);
    setSetup(nextSetup);
    setOnboarded(true);
    setSetupOpen(false);
    setProfile(plan.profile);
    setMeals(onboarded ? [...meals.filter(m=>m.checked), ...plan.meals.filter(m=>!meals.some(old=>old.checked&&old.slot===m.slot))] : plan.meals);
    setShopping(plan.shopping);
    setTodayActivity(plan.todayActivity);
    setWorkoutQueue(plan.workoutQueue);
    setWorkoutMeta({
      title: plan.workoutTitle,
      summary: plan.workoutSummary,
      focus: plan.focus,
      weekLabel: plan.weekLabel,
      goalLabel: plan.goalLabel,
      dietLabel: plan.dietLabel,
    });
    if (!onboarded) {
      setWeightData([{ date: todayIso(), value: plan.profile.weight }]);
      setDayKey(todayIso());
      setMetrics({ waist: 0, workoutsCompleted: 0, streakDays: 0, lastWorkoutDate: '', photoDataUrl: null });
    } else {
      const today = todayIso();
      setWeightData([...weightData.filter(p=>p.date!==today), { date: today, value: plan.profile.weight }]);
    }
    setQueueDate('');
    setCoachMessages([...(onboarded ? coachMessages : []), {
      id: "welcome",
      role: "coach",
      text: `Ciao ${plan.profile.name}. Piano pronto: obiettivo ${plan.goalLabel.toLowerCase()}, ${plan.calorieTarget} kcal/giorno, oggi ${plan.todayActivity}. Come ti senti?`,
    }]);
    setTab("home");
    toast.success("Piano personalizzato attivato");
  };

  const markWorkoutComplete = () => {
    const today = todayIso();
    if (metrics.lastWorkoutDate === today) {
      setCompletedWorkout(true);
      return;
    }
    const yesterdayIso = shiftDate(today, -1);
    setMetrics({
      ...metrics,
      workoutsCompleted: metrics.workoutsCompleted + 1,
      streakDays: metrics.lastWorkoutDate === yesterdayIso ? metrics.streakDays + 1 : 1,
      lastWorkoutDate: today,
    });
    setCompletedWorkout(true);
  };

  const syncCloud = async (action: "pull" | "push") => {
    if(session.remote) {
      if(action==='pull' && !window.confirm('Scaricare il cloud sostituisce i valori locali corrispondenti. Prima esporta un backup se hai modifiche da conservare. Continuare?')) return;
      try {
        if(action==='push') { await pushCloud(session); localStorage.removeItem(`gym-cloud-dirty:${session.accountId}`); setCloudStatus('Salvato sul cloud'); toast.success('Dati salvati sul cloud'); }
        else { await pullCloud(session); localStorage.removeItem(`gym-cloud-dirty:${session.accountId}`); window.location.reload(); }
      } catch(error) { toast.error(error instanceof Error ? error.message : 'Cloud non disponibile'); }
      return;
    }
    if (action === "pull" && !window.confirm("Scaricare dal cloud sovrascrive i dati locali di questo dispositivo. Continuare?")) return;
    if (action === "push" && !window.confirm("Caricare sul cloud i dati di questo dispositivo?")) return;
    const snapshot = { profile, meals, shopping, weightData, water, steps, metrics, todayActivity, setup, workoutQueue, workoutMeta, onboarded, dayKey, autoAdapt, history, overrides, queueDate, completedWorkout, coachMessages, voiceEnabled };
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.syncToken}`,
        },
        body: JSON.stringify({
          action,
          accountId: session.accountId,
          email: session.email,
          syncToken: session.syncToken,
          payload: action === "push" ? snapshot : undefined,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; payload?: typeof snapshot | null };
      if (!response.ok || !result.ok) throw new Error(result.error || "Sync non disponibile");
      if (action === "pull" && result.payload) {
        setProfile(result.payload.profile);
        setMeals(result.payload.meals);
        setShopping(result.payload.shopping);
        setWeightData(result.payload.weightData);
        setWater(result.payload.water);
        setSteps(result.payload.steps);
        setVoiceEnabled(result.payload.voiceEnabled);
        setCompletedWorkout(result.payload.completedWorkout);
        if (result.payload.history) setHistory(result.payload.history);
        if (result.payload.overrides) setOverrides(result.payload.overrides);
        if (result.payload.queueDate) setQueueDate(result.payload.queueDate);
        if (result.payload.coachMessages) setCoachMessages(result.payload.coachMessages);
        if (result.payload.metrics) setMetrics(result.payload.metrics);
        if (result.payload.todayActivity) setTodayActivity(result.payload.todayActivity);
        if (result.payload.setup) setSetup(result.payload.setup);
        if (result.payload.workoutQueue) setWorkoutQueue(result.payload.workoutQueue);
        if (result.payload.workoutMeta) setWorkoutMeta(result.payload.workoutMeta);
        if (typeof result.payload.onboarded === "boolean") setOnboarded(result.payload.onboarded);
        if (typeof (result.payload as { dayKey?: string }).dayKey === "string") setDayKey((result.payload as { dayKey: string }).dayKey);
        if (typeof (result.payload as { autoAdapt?: boolean }).autoAdapt === "boolean") setAutoAdapt((result.payload as { autoAdapt: boolean }).autoAdapt);
        toast.success("Dati scaricati dal cloud");
      } else if (action === "push") {
        toast.success("Dati sincronizzati sul cloud");
      } else {
        toast("Nessun backup cloud trovato");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync non riuscita");
    }
  };

  if (!dataReady) return <div className="auth-shell"><div className="auth-card"><p>Caricamento dei tuoi dati…</p></div></div>;

  if (!setupReady || setupOpen) {
    return (
      <>
        <SetupWizard
          initialName={session.name}
          initial={effectiveSetup}
          onComplete={applySetup}
          cancelLabel={setupReady ? "Chiudi" : "Accedi"}
          onCancel={
            setupReady
              ? () => setSetupOpen(false)
              : async () => {
                  await logoutAccount();
                  onSessionChange(null);
                  toast("Configurazione rimandata: account conservato");
                }
          }
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  const renderView = () => {
    if (tab === "home") return <Dashboard profile={profile} steps={steps} setSteps={setSteps} water={water} setWater={setWater} consumed={consumed} target={target} workoutDone={completedWorkout} startWorkout={startToday} goTo={setTab} todayActivity={currentActivity} streakDays={metrics.streakDays} workoutMeta={displayMeta} setup={effectiveSetup!} activityKind={todayActivityPlan?.kind ?? "workout"} />;
    if (tab === "workouts") return <Workouts startWorkout={startToday} workoutDone={completedWorkout} todayActivity={currentActivity} workoutQueue={workoutQueue} setWorkoutQueue={setWorkoutQueue} workoutMeta={displayMeta} setup={effectiveSetup!} activityKind={todayActivityPlan?.kind ?? "workout"} />;
    if (tab === "nutrition") return <NutritionDiary meals={meals} setMeals={setMeals} shopping={shopping} setShopping={setShopping} target={target} macros={macros} dietLabel={workoutMeta.dietLabel} history={history} />;
    if (tab === "progress") return <ProgressAndHealth profile={profile} setProfile={setProfile} weightData={weightData} setWeightData={setWeightData} metrics={metrics} setMetrics={setMetrics} history={history} completedToday={completedWorkout} />;
    if (tab === "coach") return <Coach userId={session.accountId} profile={profile} voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled} todayActivity={currentActivity} setTodayActivity={setTodayActivity} consumed={consumed} target={target} steps={steps} water={water} messages={coachMessages} setMessages={setCoachMessages} setup={effectiveSetup!} workoutQueue={workoutQueue} setWorkoutQueue={setWorkoutQueue} overrides={overrides} setOverrides={setOverrides} />;
    return (
      <ProfileView
        userId={session.accountId}
        profile={profile}
        setProfile={setProfile}
        target={target}
        voiceEnabled={voiceEnabled}
        setVoiceEnabled={setVoiceEnabled}
        openEditor={() => setProfileOpen(true)}
        exportData={() => exportAllData({ profile, meals, shopping, weightData, water, steps, metrics, todayActivity, setup, workoutQueue, workoutMeta, onboarded, dayKey, autoAdapt, history, overrides, queueDate, completedWorkout, coachMessages, voiceEnabled })}
        onImportBackup={(event) => importBackupFull(event, {
          setProfile, setMeals, setShopping, setWeightData, setWater, setSteps, setMetrics, setTodayActivity, setSetup, setWorkoutQueue, setWorkoutMeta, setOnboarded, setDayKey, setAutoAdapt, setCompletedWorkout, setCoachMessages, setVoiceEnabled, setHistory, setOverrides, setQueueDate,
        })}
        email={session.email}
        autoAdapt={autoAdapt}
        setAutoAdapt={setAutoAdapt}
        metrics={metrics}
        workoutDone={completedWorkout}
        mealsLogged={meals.filter((meal) => meal.checked).length}
        mealsTotal={meals.length}
        setup={setup}
        onReconfigure={() => setSetupOpen(true)}
        onLogout={async () => {
          await logoutAccount();
          onSessionChange(null);
        }}
        onCloudPush={() => void syncCloud("push")}
        onCloudPull={() => void syncCloud("pull")}
      />
    );
  };
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <button className="brand" onClick={() => setTab("home")} aria-label="Vai alla home di GYM & FOOD"><span className="brand-mark"><img src="/favicon.svg" alt="" className="brand-mark-img" width={44} height={44} /></span><span className="brand-copy"><strong><b>GYM</b><i>&</i><b>FOOD</b></strong><small>TRAIN · EAT · EVOLVE</small></span></button>
        <nav className="side-nav" aria-label="Navigazione principale"><span className="nav-caption">PERCORSO</span>{NAV.map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={20} strokeWidth={2.1} /><span>{label}</span></button>)}</nav>
        <div className="rail-card"><span className="rail-card-icon"><Sparkles size={17} /></span><strong>{workoutMeta.goalLabel}</strong><p>{workoutMeta.focus}</p><div className="mini-progress"><span style={{ width: `${Math.min(100, (weekCompleted / Math.max(profile.weeklyGoal, 1)) * 100)}%` }} /></div><small>{setupSummary(setup)}</small></div>
        <button className="rail-profile" onClick={() => setProfileOpen(true)}><span className="avatar">{initials(profile.name)}</span><span><strong>{profile.name}</strong><small>{session.email}</small></span><Settings2 size={17} /></button>
      </aside>
      <div className="app-body"><header className="topbar"><div className="topbar-date"><span>{topbarDate.weekday}</span><strong>{topbarDate.label}</strong></div><div className="top-actions"><button className="text-button" onClick={()=>setTab("nutrition")}><Utensils size={17}/> Diario</button><button className="profile-chip" onClick={() => setProfileOpen(true)}><span>{initials(profile.name)}</span></button></div></header><main className="main-surface"><p className="cloud-status" role="status">{cloudStatus}</p>{(tab === 'profile' || !!session.recoveryCode) && <CloudAccountPanel remote={!!session.remote} code={session.recoveryCode} onDismiss={()=>{const next={...session};delete next.recoveryCode;void idbPut('sessions',next);onSessionChange(next);}}/>}{(tab === 'home' || tab === 'workouts') && <WeeklyPlanner setup={effectiveSetup!} history={history} overrides={overrides} setOverrides={setOverrides} completed={completedWorkout} onSelect={()=>setTab('workouts')} />}{renderView()}</main></div>
      <nav className="mobile-nav" aria-label="Navigazione mobile">{MOBILE_NAV.map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={20} /><span>{label}</span></button>)}<button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><UserRound size={20} /><span>Profilo</span></button></nav>
      <GuidedWorkout open={workoutOpen} onOpenChange={setWorkoutOpen} voiceEnabled={voiceEnabled} queue={workoutQueue} onComplete={(feedback) => {
        markWorkoutComplete();
        if (feedback) setLastFeedback(feedback);
        if (autoAdapt && feedback && feedback !== "Giusta") {
          setWorkoutQueue(adaptQueueByFeedback(workoutQueue, feedback as "Troppo facile" | "Giusta" | "Troppo intensa"));
          toast.success(`Allenamento salvato · piano adattato (${feedback.toLowerCase()})`);
        } else {
          toast.success("Allenamento completato");
        }
        setWorkoutOpen(false);
      }} />
      <ProfileEditor open={profileOpen} onOpenChange={setProfileOpen} profile={profile} setProfile={setProfile} weightData={weightData} setWeightData={setWeightData} />
      <Toaster position="top-center" richColors />
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function Dashboard({ profile, steps, setSteps, water, setWater, consumed, target, workoutDone, startWorkout, goTo, todayActivity, streakDays, workoutMeta, setup, activityKind }: { profile: Profile; steps: number; setSteps: (value: number) => void; water: number; setWater: (value: number) => void; consumed: number; target: number; workoutDone: boolean; startWorkout: () => void; goTo: (tab: TabKey) => void; todayActivity: string; streakDays: number; workoutMeta: WorkoutMeta; setup: UserSetup; activityKind: DayActivity["kind"] }) {
  const dailyProgress = Math.min(100, Math.round(((Number(workoutDone) + Math.min(water / 8, 1) + Math.min(steps / 9000, 1)) / 3) * 100));
  return <div className="page-stack">
    <PageHeading eyebrow="OGGI · GYM & FOOD" title={`Ciao ${profile.name}, continuiamo così.`} description={`Piano su misura: ${workoutMeta.goalLabel.toLowerCase()} · ${workoutMeta.dietLabel.toLowerCase()}.`} action={<div className="streak"><Flame size={18} /><strong>{streakDays}</strong><span>giorni</span></div>} />
    <section className="dashboard-hero"><div className="hero-copy"><span className="status-badge"><span /> PIANO PERSONALE · OGGI</span><h2>{workoutMeta.title}</h2><p>{`Oggi: ${todayActivity}. ${workoutMeta.focus}`}</p><div className="hero-meta"><span><Clock3 size={16} /> {workoutMeta.summary.split("·")[0]?.trim() || "Sessione"}</span><span><Target size={16} /> {workoutMeta.goalLabel}</span><span><Utensils size={16} /> {target} kcal</span></div><button className="primary-button inverse" onClick={startWorkout}>{workoutDone ? <><RotateCcw size={18} /> Ripeti allenamento</> : <><Play size={18} fill="currentColor" /> {activityKind === "sport" ? "Conferma attività svolta" : activityKind === "rest" ? "Giornata di riposo" : "Inizia ora"}</>}</button></div><div className="hero-score"><div className="score-ring" style={{ "--score": `${dailyProgress * 3.6}deg` } as React.CSSProperties}><span><strong>{dailyProgress}</strong><small>%</small></span></div><p>Equilibrio di oggi</p></div></section>
    <section className="metric-grid"><MetricCard icon={Footprints} label="Passi" value={steps.toLocaleString("it-IT")} sub="Obiettivo 9.000" progress={(steps / 9000) * 100} tone="blue" action={() => setSteps(Math.min(20000, steps + 500))} /><MetricCard icon={Utensils} label="Calorie" value={`${consumed}`} unit={`/${target} kcal`} sub={`${Math.max(target - consumed, 0)} kcal disponibili`} progress={(consumed / Math.max(target, 1)) * 100} tone="orange" action={() => goTo("nutrition")} /><MetricCard icon={Utensils} label="Prossimo pasto" value="Diario" sub="Controlla ingredienti e porzioni" progress={0} tone="green" action={() => goTo("nutrition")} /><MetricCard icon={Activity} label="Acqua" value={`${water}`} unit="/8 bicchieri" sub="Idratazione di oggi" progress={(water / 8) * 100} tone="teal" action={() => setWater(Math.min(8, water + 1))} /></section>
    <section className="two-column"><article className="surface-card schedule-card"><div className="card-head"><div><span className="card-kicker">IL TUO PERCORSO</span><h3>{workoutMeta.weekLabel}</h3></div><button className="text-button" onClick={() => goTo("workouts")}>Programma <ChevronRight size={16} /></button></div><p>{(setup.trainingDays ?? defaultTrainingDays(setup.weeklyGoal)).map(d=>["Lun","Mar","Mer","Gio","Ven","Sab","Dom"][d]).join(" · ")} · {(setup.sessionMinutes ?? 20)} min a sessione</p><div className="week-callout"><Target size={21} /><div><strong>Focus</strong><p>{workoutMeta.focus}</p></div></div></article><article className="surface-card daily-plan"><div className="card-head"><div><span className="card-kicker">CHECK-IN</span><h3>Il tuo ritmo oggi</h3></div><span className="soft-badge">3 obiettivi</span></div><CheckRow done={workoutDone} label={todayActivity} detail="Sessione del piano" onClick={startWorkout} /><CheckRow done={water >= 8} label="8 bicchieri d’acqua" detail={`${water}/8`} onClick={() => setWater(Math.min(8, water + 1))} /><CheckRow done={steps >= 9000} label="9.000 passi" detail={steps.toLocaleString("it-IT")} onClick={() => setSteps(Math.min(20000, steps + 500))} /></article></section>
  </div>;
}

function MetricCard({ icon: Icon, label, value, unit, sub, progress, tone, action }: { icon: LucideIcon; label: string; value: string; unit?: string; sub: string; progress: number; tone: string; action: () => void }) { return <button className={`metric-card ${tone}`} onClick={action}><span className="metric-icon"><Icon size={20} /></span><div className="metric-copy"><span>{label}</span><strong>{value}<small>{unit}</small></strong><p>{sub}</p></div><Progress value={Math.min(progress, 100)} className="metric-progress" /></button>; }
function WeekTrack({ weeklyGoal }: { weeklyGoal: number }) { return <div className="week-track" aria-label="Giorni di allenamento settimanali">{Array.from({ length: 7 }, (_, index) => index + 1).map((day) => <div className={day <= weeklyGoal ? "current" : ""} key={day}><span>{day <= weeklyGoal ? <Check size={12} /> : day}</span>{day === 1 && <small>SETT</small>}</div>)}</div>; }
function CheckRow({ done, label, detail, onClick }: { done: boolean; label: string; detail: string; onClick: () => void }) { return <button className="check-row" onClick={onClick}><span className={done ? "check-circle done" : "check-circle"}>{done && <Check size={15} />}</span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={17} /></button>; }

function Workouts({ startWorkout, workoutDone, todayActivity, workoutQueue, setWorkoutQueue, workoutMeta, setup, activityKind }: { startWorkout: () => void; workoutDone: boolean; todayActivity: string; workoutQueue: Exercise[]; setWorkoutQueue: (queue: Exercise[]) => void; workoutMeta: WorkoutMeta; setup: UserSetup | null; activityKind: DayActivity["kind"] }) {
  const [difficulty, setDifficulty] = useState("Bilanciato");
  const note = difficulty === "Più facile" ? "Riduci le tenute e ascolta il recupero: la tecnica resta priorità." : difficulty === "Più intenso" ? "Puoi allungare leggermente le tenute se la forma resta pulita." : "Il carico attuale è calibrato sul tuo obiettivo e sul tuo livello.";
  const warmup = workoutQueue.filter((item) => item.stage === "Riscaldamento");
  const main = workoutQueue.filter((item) => item.stage === "Allenamento");
  const cooldown = workoutQueue.filter((item) => item.stage === "Stretching");
  return <div className="page-stack"><PageHeading eyebrow="PROGRAMMA" title="Allenamenti sul tuo obiettivo" description={workoutMeta.weekLabel} action={<button className="primary-button" onClick={startWorkout}><Play size={18} fill="currentColor" /> {workoutDone ? "Attività completata" : activityKind === "sport" ? "Conferma attività svolta" : activityKind === "rest" ? "Riposo previsto" : "Inizia sessione"}</button>} />
    <section className="workout-top-grid"><article className="workout-feature"><div className="feature-top"><span className="status-badge light"><span /> ALLENAMENTO DI OGGI</span><span className="soft-badge">{workoutMeta.goalLabel}</span></div><h2>{workoutMeta.title}</h2><p>{workoutMeta.summary} · oggi: {todayActivity}</p><div className="phase-line"><div><span className="phase-dot warm" /><strong>Riscaldamento</strong><small>{warmup.length} esercizi</small></div><div><span className="phase-dot active" /><strong>Allenamento</strong><small>{main.length} timer</small></div><div><span className="phase-dot cool" /><strong>Stretching</strong><small>{cooldown.length} esercizi</small></div></div><button className="primary-button inverse" onClick={startWorkout}><CirclePlay size={19} /> {activityKind === "sport" ? "Conferma attività svolta" : activityKind === "rest" ? "Recupero previsto" : "Apri allenamento guidato"}</button></article><article className="surface-card adaptive-card" hidden={activityKind !== "workout"}><span className="card-kicker">ADATTAMENTO</span><h3>Intensità della sessione</h3><div className="segment-control">{["Più facile", "Bilanciato", "Più intenso"].map((option) => <button key={option} className={difficulty === option ? "active" : ""} onClick={() => { setDifficulty(option); const base = setup ? sessionForDate(setup, todayIso()) : workoutQueue; setWorkoutQueue(option === "Bilanciato" ? base : adaptQueueByDifficulty(base, option as "Più facile" | "Bilanciato" | "Più intenso")); toast.success(`Intensità: ${option}`); }}>{option}</button>)}</div><div className="coach-note"><Sparkles size={19} /><p>{note}</p></div></article></section>
    <section className="surface-card plan-list-card" hidden={activityKind !== "workout"}><div className="card-head"><div><span className="card-kicker">STRUTTURA COMPLETA</span><h3>{workoutMeta.title}</h3></div><span className="soft-badge"><TimerReset size={14} /> {workoutQueue.length} esercizi</span></div><div className="phase-block"><PhaseHeader number="01" title="Riscaldamento" subtitle="Attivazione e mobilità" color="warm" />{warmup.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} />)}</div><div className="phase-block"><PhaseHeader number="02" title="Allenamento" subtitle={workoutMeta.focus} color="active" />{main.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} compact />)}</div><div className="phase-block"><PhaseHeader number="03" title="Stretching finale" subtitle="Recupero e respirazione" color="cool" />{cooldown.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} />)}</div></section>
  </div>;
}
function PhaseHeader({ number, title, subtitle, color }: { number: string; title: string; subtitle: string; color: string }) { return <div className={`phase-header ${color}`}><span>{number}</span><div><strong>{title}</strong><small>{subtitle}</small></div></div>; }
function ExerciseRow({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) { return <div className="exercise-row"><span className="exercise-play"><Play size={14} fill="currentColor" /></span><div><strong>{exercise.name}{exercise.side ? ` · ${exercise.side}` : ""}</strong><small>{exercise.focus}</small></div>{exercise.set && <span className="set-badge">Serie {exercise.set}</span>}<span className="duration"><Clock3 size={14} /> {exercise.seconds}s</span>{!compact && <a href={`https://www.youtube.com/watch?v=${exercise.videoId}`} target="_blank" rel="noreferrer" aria-label={`Apri il video di ${exercise.name}`}><Video size={17} /></a>}</div>; }

function ProgressAndHealth({ profile, setProfile, weightData, setWeightData, metrics, setMetrics, history, completedToday }: { profile: Profile; setProfile: (profile: Profile) => void; weightData: { date: string; value: number }[]; setWeightData: (data: { date: string; value: number }[]) => void; metrics: ProgressMetrics; setMetrics: (metrics: ProgressMetrics) => void; history: DayRecord[]; completedToday: boolean }) {
  const [view, setView] = useState("progress");
  const [weight, setWeight] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [waistDraft, setWaistDraft] = useState(String(metrics.waist));
  const [workoutsDraft, setWorkoutsDraft] = useState(String(metrics.workoutsCompleted));
  const [streakDraft, setStreakDraft] = useState(String(metrics.streakDays));
  const [reviewOpen, setReviewOpen] = useState(false);
  const currentWeight = weightData.at(-1)?.value ?? profile.weight;
  const startWeight = weightData[0]?.value ?? profile.weight;
  const lost = startWeight - currentWeight;
  const chartMin = Math.floor(Math.min(...weightData.map((point) => point.value), currentWeight) - 1);
  const chartMax = Math.ceil(Math.max(...weightData.map((point) => point.value), currentWeight) + 1);
  const weeklyCount = weekSummary(history, todayIso(), completedToday);
  const trend = weightTrend(weightData, todayIso());
  const completionPct = Math.min(100, Math.round(weeklyCount / Math.max(profile.weeklyGoal, 1) * 100));
  const reviewScore = `${weeklyCount}`;
  const saveWeight = () => {
    if (!weight) return;
    const nextValue = Number(weight);
    if (!Number.isFinite(nextValue) || nextValue < 35 || nextValue > 350) return toast.error("Inserisci un peso tra 35 e 350 kg.");
    const today = todayIso();
    const last = weightData.at(-1);
    const next =
      last && (last.date === today || last.date.startsWith(today))
        ? [...weightData.slice(0, -1), { date: today, value: nextValue }]
        : [...weightData, { date: today, value: nextValue }];
    setWeightData(next);
    setProfile({ ...profile, weight: nextValue });
    setWeight("");
    toast.success("Peso aggiornato in Progressi e Profilo");
  };
  const savePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setMetrics({ ...metrics, photoDataUrl: String(reader.result) });
      toast.success("Foto progresso salvata");
    };
    reader.readAsDataURL(file);
  };
  return <div className="page-stack"><PageHeading eyebrow="RISULTATI & SALUTE" title="I numeri che contano davvero" description="Peso, misure, frequenza cardiaca e recupero letti nello stesso contesto." action={<div className="segment-control heading-segment"><button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}>Progressi</button><button className={view === "health" ? "active" : ""} onClick={() => setView("health")}>Salute</button></div>} />
    {view === "progress" ? <><section className="summary-grid"><SummaryCard label="Peso attuale" value={`${currentWeight.toFixed(1)} kg`} detail={`${lost >= 0 ? "−" : "+"}${Math.abs(lost).toFixed(1)} kg dall’inizio`} icon={TrendingDown} tone="orange" /><SummaryCard label="Girovita" value={metrics.waist > 0 ? `${metrics.waist} cm` : "Da misurare"} detail="Tocca Modifica misure per aggiornare" icon={Target} tone="blue" /><SummaryCard label="Allenamenti" value={`${metrics.workoutsCompleted}`} detail={`${weeklyCount}/${profile.weeklyGoal} nella settimana`} icon={Dumbbell} tone="green" /><SummaryCard label="Costanza" value={`${metrics.streakDays} giorni`} detail={metrics.lastWorkoutDate ? `Ultimo: ${metrics.lastWorkoutDate}` : "Completa una sessione"} icon={Flame} tone="orange" /></section>
    <button className="secondary-button full metrics-edit-btn" onClick={() => { setWaistDraft(String(metrics.waist)); setWorkoutsDraft(String(metrics.workoutsCompleted)); setStreakDraft(String(metrics.streakDays)); setEditOpen(true); }}><Settings2 size={17} /> Modifica misure e contatori</button>
    <section className="two-column chart-layout"><article className="surface-card chart-card"><div className="card-head"><div><span className="card-kicker">ANDAMENTO</span><h3>Peso corporeo</h3></div><div className="inline-add"><Input type="number" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="kg" /><button onClick={saveWeight}><Plus size={17} /></button></div></div><p className="chart-sync-note">Allineato al profilo: {profile.weight.toFixed(1)} kg</p><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weightData}><defs><linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5b17" stopOpacity={0.25} /><stop offset="100%" stopColor="#ff5b17" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ece5dc" /><XAxis dataKey="date" axisLine={false} tickLine={false} /><YAxis domain={[chartMin, chartMax]} axisLine={false} tickLine={false} width={32} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#ff5b17" strokeWidth={3} fill="url(#weightFill)" dot={{ r: 4, fill: "#fff", stroke: "#ff5b17", strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div></article><article className="surface-card photo-card"><div className="card-head"><div><span className="card-kicker">FOTO PROGRESSO</span><h3>Confronta nel tempo</h3></div></div>{metrics.photoDataUrl ? <img src={metrics.photoDataUrl} alt="Foto progresso caricata" /> : <div className="photo-placeholder"><Camera size={28} /><strong>Aggiungi una foto</strong><p>Salvata in questo dispositivo.</p></div>}<label className="secondary-button full"><Upload size={17} /> {metrics.photoDataUrl ? "Sostituisci foto" : "Carica foto"}<input type="file" accept="image/*" capture="environment" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) savePhoto(file); }} /></label></article></section><section className="surface-card review-card"><div className="review-score"><strong>{reviewScore}</strong><span>/{profile.weeklyGoal}</span></div><div><span className="card-kicker">REVISIONE SETTIMANALE</span><h3>Le tue ultime due settimane</h3><p>{weeklyCount} sessioni questa settimana · {trend.change === null ? "Servono almeno due pesate per ciascuna delle ultime due settimane per confrontare le medie." : `Variazione media: ${trend.change > 0 ? "+" : ""}${trend.change.toFixed(1)} kg rispetto alla settimana precedente.`}</p></div><button className="text-button" onClick={() => setReviewOpen(true)}>Apri revisione <ChevronRight size={16} /></button></section>
    <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>Modifica misure</DialogTitle><DialogDescription>Questi valori aggiornano le card Progressi e il profilo riassuntivo.</DialogDescription></DialogHeader><div className="form-stack"><label>Girovita (cm)<Input type="number" value={waistDraft} onChange={(event) => setWaistDraft(event.target.value)} /></label><label>Allenamenti completati<Input type="number" value={workoutsDraft} onChange={(event) => setWorkoutsDraft(event.target.value)} /></label><label>Giorni di costanza<Input type="number" value={streakDraft} onChange={(event) => setStreakDraft(event.target.value)} /></label><button className="primary-button full" onClick={() => { setMetrics({ ...metrics, waist: Number(waistDraft) || metrics.waist, workoutsCompleted: Math.max(0, Number(workoutsDraft) || 0), streakDays: Math.max(0, Number(streakDraft) || 0) }); setEditOpen(false); toast.success("Misure aggiornate"); }}>Salva</button></div></DialogContent></Dialog>
    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>Revisione settimanale</DialogTitle><DialogDescription>Sintesi basata sui tuoi dati salvati.</DialogDescription></DialogHeader><div className="form-stack review-body"><p><strong>Sessioni della settimana: {weeklyCount}/{profile.weeklyGoal}</strong></p><p>Peso: {currentWeight.toFixed(1)} kg ({lost >= 0 ? "−" : "+"}{Math.abs(lost).toFixed(1)} kg dall’inizio).</p><p>Girovita: {metrics.waist} cm · Costanza: {metrics.streakDays} giorni · Sessioni: {metrics.workoutsCompleted}.</p><p>{trend.change === null ? "Dati insufficienti per valutare un andamento settimanale: registra il peso in giorni distinti." : `Media ultimi 7 giorni: ${trend.recent?.toFixed(1)} kg; 7 giorni precedenti: ${trend.previous?.toFixed(1)} kg. Questo confronto descrive i dati, senza valutazioni cliniche.`}</p><button className="primary-button full" onClick={() => setReviewOpen(false)}>Chiudi</button></div></DialogContent></Dialog>
    </> : <section className="surface-card"><span className="card-kicker">DATI DISPONIBILI</span><h3>Misure inserite da te</h3><p>Peso: {currentWeight.toFixed(1)} kg · BMI: {bmi({ ...profile, weight: currentWeight }).toFixed(1)}.</p><p>Il BMI è un indicatore generale e non descrive da solo composizione corporea o salute. Battito, sonno e calorie attive non vengono rilevati da questa web app.</p></section>}

  </div>;
}
function SummaryCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: LucideIcon; tone: string }) { return <article className={`summary-card ${tone}`}><span><Icon size={20} /></span><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>; }

function Coach({ userId, profile, voiceEnabled, setVoiceEnabled, todayActivity, setTodayActivity, consumed, target, steps, water, messages, setMessages, setup, workoutQueue, setWorkoutQueue, overrides, setOverrides }: { userId: string; profile: Profile; voiceEnabled: boolean; setVoiceEnabled: (value: boolean) => void; todayActivity: string; setTodayActivity: (value: string) => void; consumed: number; target: number; steps: number; water: number; messages: CoachMessage[]; setMessages: (messages: CoachMessage[]) => void; setup: UserSetup; workoutQueue: Exercise[]; setWorkoutQueue: (queue: Exercise[]) => void; overrides: Record<string,DayActivity>; setOverrides: (v: Record<string,DayActivity>)=>void }) {
  const remaining = Math.max(target - consumed, 0);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  const answer = (text: string) => {
    const lower = text.toLowerCase();
    if (/(ripristin|rimetti|riprend|torna).*piano|sessione di base|allenamento originale/.test(lower)) {
      const next = { ...overrides }; delete next[todayIso()]; setOverrides(next);
      setWorkoutQueue(sessionForDate(setup, todayIso()));
      setTodayActivity(setup.goal === "build_muscle" ? "Forza · sessione piano" : setup.goal === "endurance" ? "Resistenza · sessione piano" : "Sessione del piano");
      return `Ok: torno alla sessione prevista dal tuo piano (${setupSummary(setup)}).`;
    }
    if (/(ripristina|rimetti|riprendi).*core/.test(lower)) {
      const next = { ...overrides }; delete next[todayIso()]; setOverrides(next);
      setWorkoutQueue(sessionForDate(setup, todayIso()));
      return 'Ho ripristinato la sessione prevista dal calendario. Nei giorni di riposo resta previsto recupero.';
    }
    const mentionsReplace = /(annull|sostitu|mettiamo|invece|al posto|cambio|cambiamo|skip|salt)/.test(lower);
    const sportMatch = lower.match(/(beach\s*volley|pallavolo|nuoto|corsa|running|yoga|pilates|calcio|tennis|caminat|camminat|bici|ciclismo|hiit)/);
    if (mentionsReplace || sportMatch) {
      const activity = sportMatch
        ? sportMatch[1].replace(/\s+/g, " ").replace(/^./, (char) => char.toUpperCase())
        : "attività libera";
      const label = activity.includes("Beach") || activity.toLowerCase().includes("beach") ? "Beach volley" : activity;
      setTodayActivity(label);
      setOverrides({ ...overrides, [todayIso()]: { kind: "sport", label, minutes: 30 } });
      setWorkoutQueue([]);
      return `Perfetto: per oggi imposto ${label} come attività libera da 30 minuti. Puoi cambiare la durata dal calendario e confermare l’attività dalla Home.`;
    }
    if (lower.includes("schiena") || lower.includes("dolore")) return "In presenza di dolore interrompi il movimento che lo provoca. Non posso stabilire quale esercizio sia adatto al tuo caso: confrontati con un professionista sanitario prima di riprendere.";
    if (/(peso|quanto peso|kg)/.test(lower)) return `Il tuo peso profilo è ${profile.weight.toFixed(1)} kg (obiettivo ${profile.goalWeight} kg). Ti restano ${(profile.weight - profile.goalWeight).toFixed(1)} kg.`;
    if (lower.includes("mang") || lower.includes("fame") || lower.includes("cena") || lower.includes("calorie")) return `Hai consumato ${consumed} kcal su ${target}. Ti restano circa ${remaining} kcal. Per cena scegli proteine, verdure e una porzione di carboidrati.`;
    if (lower.includes("passi") || lower.includes("acqua")) return `Ora sei a ${steps.toLocaleString("it-IT")} passi e ${water}/8 bicchieri d’acqua. Obiettivo passi: 9.000.`;
    if (lower.includes("stanco") || lower.includes("sonno")) return "Ascolta la percezione reale: prova il riscaldamento e, se resti scarico, scegli l’intensità più facile senza saltare lo stretching.";
    if (workoutQueue.length && (lower.includes("aument") || lower.includes("più difficile") || lower.includes("piu difficile"))) {
      setWorkoutQueue(adaptQueueByFeedback(workoutQueue, "Troppo facile"));
      return "Ho aumentato i tempi di tenuta del piano di oggi. Dimmi dopo la sessione se è ancora troppo leggero.";
    }
    if (workoutQueue.length && (lower.includes("più facile") || lower.includes("piu facile") || lower.includes("riduci") || (lower.includes("difficile") && lower.includes("troppo")))) {
      setWorkoutQueue(adaptQueueByFeedback(workoutQueue, "Troppo intensa"));
      return "Ho alleggerito tenute e allungato i recuperi per oggi.";
    }
    if (lower.includes("oggi") && lower.includes("attività")) return `Ok, dimmi pure quale attività vuoi fare al posto del core di oggi (es. beach volley, corsa, yoga) e aggiorno il piano. Ora risulta: ${todayActivity}.`;
    return `Ricevuto. Oggi: ${todayActivity}, ${remaining} kcal residue, ${steps.toLocaleString("it-IT")} passi. Posso adattare intensità, esercizio, durata oppure sostituire l’allenamento. Cosa preferisci?`;
  };
  const send = (preset?: string) => {
    const text = (preset ?? draft).trim();
    if (!text) return;
    const response = answer(text);
    setMessages([...messages, { id: crypto.randomUUID(), role: "user", text }, { id: crypto.randomUUID(), role: "coach", text: response }]);
    setDraft("");
    if (voiceEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(response);
      utterance.lang = "it-IT";
      utterance.rate = 0.98;
      window.speechSynthesis.speak(utterance);
    }
  };
  return <div className="page-stack coach-page"><PageHeading eyebrow="COACH" title="Il tuo supporto quotidiano" description="Coach locale gratuito basato su regole (non un modello AI a pagamento). Può adattare davvero la coda esercizi." action={<label className="voice-control">{voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />} Voce <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} /></label>} /><section className="coach-layout"><article className="chat-card"><div className="chat-head"><span className="coach-avatar"><Bot size={23} /></span><div><strong>Coach GYM & FOOD</strong><small><span /> Regole locali · conosce il tuo piano</small></div></div><div className="messages">{messages.map((message) => <div key={message.id} className={`message ${message.role}`}><span>{message.role === "coach" ? <Bot size={17} /> : initials(profile.name)}</span><p>{message.text}</p></div>)}<div ref={endRef} /></div><div className="suggestions">{["Sono stanco oggi", "Cosa mangio a cena?", "Oggi annulliamo e mettiamo beach volley", "Ripristina il core"].map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)}>{suggestion}</button>)}</div><div className="composer"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Scrivi al tuo coach…" /><button onClick={() => send()} aria-label="Invia messaggio"><Send size={19} /></button></div></article><aside className="coach-context"><article className="surface-card"><span className="card-kicker">CONTESTO DI OGGI</span><h3>Cosa vede il coach</h3><ContextRow icon={HeartPulse} label="Acqua" value={`${water}/8`} /><ContextRow icon={Dumbbell} label="Sessione" value={todayActivity} /><ContextRow icon={Utensils} label="Calorie" value={`${consumed} / ${target}`} /><ContextRow icon={Footprints} label="Passi" value={steps.toLocaleString("it-IT")} /></article><article className="surface-card privacy-note"><span><Check size={17} /></span><div><strong>Dati sotto controllo</strong><p>Le conversazioni e le preferenze restano salvate nel browser.</p></div></article></aside></section></div>;
}
function ContextRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) { return <div className="context-row"><span><Icon size={17} /></span><small>{label}</small><strong>{value}</strong></div>; }

function ProfileView({ userId, profile, setProfile, target, voiceEnabled, setVoiceEnabled, openEditor, exportData, onImportBackup, email, metrics, workoutDone, mealsLogged, mealsTotal, setup, onReconfigure, onLogout, onCloudPush, onCloudPull, autoAdapt, setAutoAdapt }: { userId: string; profile: Profile; setProfile: (profile: Profile) => void; target: number; voiceEnabled: boolean; setVoiceEnabled: (value: boolean) => void; openEditor: () => void; exportData: () => void; onImportBackup: (event: React.ChangeEvent<HTMLInputElement>) => void; email: string; metrics: ProgressMetrics; workoutDone: boolean; mealsLogged: number; mealsTotal: number; setup: UserSetup; onReconfigure: () => void; onLogout: () => void | Promise<void>; onCloudPush: () => void; onCloudPull: () => void; autoAdapt: boolean; setAutoAdapt: (value: boolean) => void }) {
  const currentBmi = bmi(profile);
  const [notifyWorkout, setNotifyWorkout] = useUserState(userId, "addome-notify-workout", true);
  const [notifyMeals, setNotifyMeals] = useUserState(userId, "addome-notify-meals", true);
  const [notifyCoach, setNotifyCoach] = useUserState(userId, "addome-notify-coach", false);
  const [notifyWeekly, setNotifyWeekly] = useUserState(userId, "addome-notify-weekly", true);
  useEffect(() => {
    const prefs = { workout: notifyWorkout, meals: notifyMeals, coach: notifyCoach, weekly: notifyWeekly };
    runNotificationChecks(prefs, { workoutDone, mealsLogged, mealsTotal });
    const timer = window.setInterval(() => {
      runNotificationChecks(prefs, { workoutDone, mealsLogged, mealsTotal });
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [notifyWorkout, notifyMeals, notifyCoach, notifyWeekly, workoutDone, mealsLogged, mealsTotal]);
  const requestPushPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Questo browser non supporta le notifiche");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      toast.success("Notifiche abilitate: i promemoria partono con l’app aperta");
      runNotificationChecks(
        { workout: notifyWorkout, meals: notifyMeals, coach: notifyCoach, weekly: notifyWeekly },
        { workoutDone, mealsLogged, mealsTotal },
      );
      try {
        new Notification("GYM & FOOD", { body: "Promemoria allenamento e pasti attivati." });
      } catch {
        /* ignore preview failures */
      }
    } else if (permission === "denied") {
      toast.error("Notifiche bloccate. Abilitale dalle impostazioni del browser/iPhone.");
    } else {
      toast("Permesso notifiche non concesso");
    }
  };
  return <div className="page-stack"><PageHeading eyebrow="PROFILO" title="Il tuo percorso, alle tue condizioni" description="Obiettivi, preferenze e dati personali in un unico posto." action={<div className="profile-actions"><button className="secondary-button" onClick={openEditor}><Settings2 size={17} /> Modifica profilo</button><button className="primary-button" onClick={onReconfigure}><Sparkles size={17} /> Riconfigura piano</button></div>} /><section className="profile-banner"><span className="profile-avatar-large">{initials(profile.name)}</span><div><h2>{profile.name}</h2><p>{email}</p><div><span><Flame size={15} /> {metrics.streakDays} giorni</span><span><Star size={15} /> {Math.round(metrics.workoutsCompleted * 120)} XP</span><span><Dumbbell size={15} /> {metrics.workoutsCompleted} workout</span></div></div><span className="premium-pill"><Sparkles size={15} /> {setupSummary(setup)}</span></section><section className="summary-grid"><SummaryCard label="Obiettivo peso" value={`${profile.goalWeight} kg`} detail={`${(profile.weight - profile.goalWeight).toFixed(1)} kg rimanenti`} icon={Target} tone="orange" /><SummaryCard label="BMI attuale" value={currentBmi.toFixed(1)} detail={currentBmi < 25 ? "Da leggere con il contesto" : "Da leggere con il contesto"} icon={Activity} tone="blue" /><SummaryCard label="Obiettivo calorie" value={`${target} kcal`} detail="Stima dal profilo aggiornato" icon={Flame} tone="orange" /><SummaryCard label="Allenamenti" value={`${profile.weeklyGoal}/sett.`} detail={`${metrics.workoutsCompleted} completati in totale`} icon={Dumbbell} tone="green" /></section><section className="settings-layout"><article className="surface-card settings-card"><div className="card-head"><div><span className="card-kicker">PREFERENZE</span><h3>Esperienza</h3></div></div><SettingRow icon={Volume2} label="Guida vocale" detail="Istruzioni durante gli esercizi" control={<Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />} /><SettingRow icon={Watch} label="Dati Apple Watch" detail="Non disponibile in web app gratuita" control={<span className="sync-badge"><span /> Demo</span>} /><SettingRow icon={Sparkles} label="Adattamento automatico" detail="Dopo il feedback modifica davvero i secondi/pause" control={<Switch checked={autoAdapt} onCheckedChange={setAutoAdapt} />} /></article><article className="surface-card settings-card"><div className="card-head"><div><span className="card-kicker">NOTIFICHE</span><h3>Promemoria</h3></div></div><SettingRow icon={Bell} label="Allenamento" detail="Dopo le 17 se non hai fatto la sessione" control={<Switch checked={notifyWorkout} onCheckedChange={setNotifyWorkout} />} /><SettingRow icon={Utensils} label="Pasti" detail="Promemoria diario a metà giornata" control={<Switch checked={notifyMeals} onCheckedChange={setNotifyMeals} />} /><SettingRow icon={MessageCircle} label="Coach" detail="Check-in serale" control={<Switch checked={notifyCoach} onCheckedChange={setNotifyCoach} />} /><SettingRow icon={BarChart3} label="Revisione settimanale" detail="Promemoria la domenica" control={<Switch checked={notifyWeekly} onCheckedChange={setNotifyWeekly} />} /><button className="settings-action" onClick={() => void requestPushPermission()}><Bell size={18} /><span><strong>Attiva notifiche dispositivo</strong><small>Funzionano con l’app aperta / in PWA</small></span><ChevronRight size={17} /></button></article><article className="surface-card settings-card"><div className="card-head"><div><span className="card-kicker">I TUOI DATI</span><h3>Backup, cloud e account</h3></div></div><button className="settings-action" onClick={exportData}><Download size={18} /><span><strong>Esporta backup</strong><small>Scarica profilo e progressi in JSON</small></span><ChevronRight size={17} /></button><label className="settings-action"><Upload size={18} /><span><strong>Importa backup</strong><small>Ripristina dati da un file</small></span><ChevronRight size={17} /><input type="file" accept="application/json" hidden onChange={onImportBackup} /></label><button className="settings-action" onClick={onCloudPush}><RefreshCw size={18} /><span><strong>Carica sul cloud</strong><small>Sincronizza via API /api/sync</small></span><ChevronRight size={17} /></button><button className="settings-action" onClick={onCloudPull}><Download size={18} /><span><strong>Scarica dal cloud</strong><small>Ripristina l’ultimo sync remoto</small></span><ChevronRight size={17} /></button><button className="settings-action" onClick={async () => {
            const current = window.prompt("Password attuale");
            if (!current) return;
            const next = window.prompt("Nuova password (min 10 caratteri)");
            if (!next) return;
            try {
              await changePassword(userId, current || "", next);
              toast.success("Password aggiornata. Esci e rientra per aggiornare la sessione.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Cambio password non riuscito");
            }
          }}><Settings2 size={18} /><span><strong>Cambia password</strong><small>Account cloud e dispositivo</small></span><ChevronRight size={17} /></button><button className="settings-action danger" onClick={() => { if (window.confirm("Uscire dall’account su questo dispositivo?")) void onLogout(); }}><Trash2 size={18} /><span><strong>Esci dall’account</strong><small>I dati restano salvati su questo dispositivo</small></span><ChevronRight size={17} /></button></article></section></div>;
}
function SettingRow({ icon: Icon, label, detail, control }: { icon: LucideIcon; label: string; detail: string; control: React.ReactNode }) { return <div className="setting-row"><span><Icon size={18} /></span><div><strong>{label}</strong><small>{detail}</small></div>{control}</div>; }

function ProfileEditor({ open, onOpenChange, profile, setProfile, weightData, setWeightData }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile; setProfile: (profile: Profile) => void; weightData: { date: string; value: number }[]; setWeightData: (data: { date: string; value: number }[]) => void }) {
  const [draft, setDraft] = useState(profile); useEffect(() => setDraft(profile), [profile, open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>Modifica profilo</DialogTitle><DialogDescription>Questi dati aggiornano BMI, calorie e progressione degli allenamenti.</DialogDescription></DialogHeader><div className="form-stack"><label>Nome<Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><div className="form-grid"><label>Età<Input type="number" value={draft.age} onChange={(event) => setDraft({ ...draft, age: Number(event.target.value) })} /></label><label>Altezza (cm)<Input type="number" value={draft.height} onChange={(event) => setDraft({ ...draft, height: Number(event.target.value) })} /></label><label>Peso attuale (kg)<Input type="number" step="0.1" value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: Number(event.target.value) })} /></label><label>Peso obiettivo (kg)<Input type="number" step="0.1" value={draft.goalWeight} onChange={(event) => setDraft({ ...draft, goalWeight: Number(event.target.value) })} /></label></div><label>Allenamenti a settimana<div className="stepper"><button onClick={() => setDraft({ ...draft, weeklyGoal: Math.max(1, draft.weeklyGoal - 1) })}><Minus size={17} /></button><strong>{draft.weeklyGoal}</strong><button onClick={() => setDraft({ ...draft, weeklyGoal: Math.min(7, draft.weeklyGoal + 1) })}><Plus size={17} /></button></div></label><button className="primary-button full" onClick={() => { if (!draft.name.trim() || draft.age < 18 || draft.age > 100 || draft.height < 120 || draft.height > 230 || draft.weight < 35 || draft.weight > 350 || draft.goalWeight < 35 || draft.goalWeight > 350) { toast.error("Controlla i dati del profilo"); return; } setProfile(draft); onOpenChange(false); toast.success("Profilo e progressi aggiornati"); }}>Salva modifiche</button></div></DialogContent></Dialog>;
}

function exportAllData(data: unknown) { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `gym-food-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); toast.success("Backup esportato"); }
function importBackupFull(event: React.ChangeEvent<HTMLInputElement>, setters: Record<string, (value: never) => void>) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 5_000_000) { toast.error("Backup troppo grande: massimo 5 MB"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as { data?: Record<string, unknown> };
      const result = backupSchema.safeParse(parsed?.data ?? parsed);
      if (!result.success) { toast.error("Backup non valido: dati incompleti o valori non corretti. Nessuna modifica applicata."); return; }
      const data = result.data;
      if (!data || typeof data !== "object" || !("profile" in data)) {
        toast.error("Il file non contiene un backup valido");
        return;
      }
      const map: Array<[string, string]> = [
        ["profile", "setProfile"], ["meals", "setMeals"], ["shopping", "setShopping"], ["weightData", "setWeightData"],
        ["water", "setWater"], ["steps", "setSteps"], ["metrics", "setMetrics"], ["todayActivity", "setTodayActivity"],
        ["setup", "setSetup"], ["workoutQueue", "setWorkoutQueue"], ["workoutMeta", "setWorkoutMeta"],
        ["onboarded", "setOnboarded"], ["dayKey", "setDayKey"], ["autoAdapt", "setAutoAdapt"],
        ["history", "setHistory"], ["overrides", "setOverrides"], ["queueDate", "setQueueDate"], ["completedWorkout", "setCompletedWorkout"], ["coachMessages", "setCoachMessages"], ["voiceEnabled", "setVoiceEnabled"],
      ];
      for (const [key, setterName] of map) {
        if (key in data && typeof setters[setterName] === "function") {
          setters[setterName](data[key] as never);
        }
      }
      toast.success("Backup importato");
    } catch {
      toast.error("Backup non leggibile");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}
