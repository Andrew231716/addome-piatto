"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bot, Camera, Check, ChevronRight,
  CirclePlay, Clock3, Download, Dumbbell, Flame, Footprints, HeartPulse, Home,
  MessageCircle, Minus, Move, Pause, Play, Plus, RefreshCw, RotateCcw, Search,
  Send, Settings2, Sparkles, Square, Star, Target, TimerReset, Trash2,
  TrendingDown, Upload, UserRound, Utensils, Video, Volume2, VolumeX, Watch, X,
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
  getSession,
  loginAccount,
  logoutAccount,
  migrateLegacyGuest,
  readLegacyLocalProfile,
  registerAccount,
  type Session,
  updateAccountName,
} from "@/lib/auth";
import { loadUserValue, saveUserValue } from "@/lib/user-data";

type TabKey = "home" | "workouts" | "nutrition" | "progress" | "coach" | "profile";
type WorkoutStage = "Riscaldamento" | "Allenamento" | "Stretching";
type Profile = { name: string; age: number; height: number; weight: number; goalWeight: number; weeklyGoal: number };
type Exercise = { id: string; name: string; focus: string; seconds: number; stage: WorkoutStage; cue: string; videoId: string; side?: "Sinistra" | "Destra"; set?: number };
type Meal = { id: string; slot: string; name: string; calories: number; protein: number; carbs: number; fat: number; checked: boolean };
type ShoppingItem = { id: string; name: string; category: string; checked: boolean };
type CoachMessage = { id: string; role: "user" | "coach"; text: string };

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

const WORKOUT_QUEUE = [...WARMUP, ...MAIN_EXERCISES, ...COOLDOWN];
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
const RECIPES = [
  { id: "r1", name: "Bowl mediterranea proteica", time: "22 min", calories: 540, protein: 41, tags: ["Alta in proteine", "Pranzo"] },
  { id: "r2", name: "Piadina integrale con tacchino", time: "12 min", calories: 430, protein: 35, tags: ["Veloce", "Cena"] },
  { id: "r3", name: "Porridge cacao e banana", time: "8 min", calories: 390, protein: 26, tags: ["Colazione", "Vegetariana"] },
];
const WEIGHT_SEED = [{ date: "2 set", value: 77.8 }, { date: "6 set", value: 77.4 }, { date: "10 set", value: 77.2 }, { date: "14 set", value: 76.8 }, { date: "18 set", value: 76.5 }, { date: "23 set", value: 76.2 }];
const HEART_SEED = [{ label: "Lun", rest: 64, workout: 128 }, { label: "Mar", rest: 63, workout: 134 }, { label: "Mer", rest: 62, workout: 131 }, { label: "Gio", rest: 62, workout: 139 }, { label: "Ven", rest: 61, workout: 136 }, { label: "Sab", rest: 61, workout: 142 }, { label: "Oggi", rest: 60, workout: 137 }];

function useUserState<T>(userId: string, key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    loadUserValue(userId, key, fallback).then((loaded) => {
      if (!cancelled) {
        setValue(loaded);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, key]);
  useEffect(() => {
    if (ready) void saveUserValue(userId, key, value);
  }, [userId, key, ready, value]);
  return [value, setValue] as const;
}

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatTimer(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function bmi(profile: Profile) { const meters = profile.height / 100; return profile.weight / (meters * meters); }
function calorieTarget(profile: Profile) { const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5; return Math.round(bmr * 1.42 - 380); }

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState(readLegacyLocalProfile()?.name ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const legacy = readLegacyLocalProfile();

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const session =
        mode === "login"
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
      toast.success("Sessione locale ripristinata (password iniziale: gymfood)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ripristino non riuscito");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Dumbbell className="brand-gym-icon" size={22} /><Utensils className="brand-food-icon" size={17} /></span>
          <strong><b>GYM</b><i>&</i><b>FOOD</b></strong>
          <p>Allenati. Nutriti. Migliora — con account reale e dati nel tuo dispositivo.</p>
        </div>
        <div className="segment-control auth-toggle">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Accedi</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Crea account</button>
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
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Almeno 6 caratteri" />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button full" disabled={busy} onClick={() => void submit()}>
            {busy ? "Attendere…" : mode === "login" ? "Entra" : "Registrati"}
          </button>
          {legacy && (
            <button className="secondary-button full" disabled={busy} onClick={() => void restoreLegacy()}>
              Ripristina dati locali di {legacy.name}
            </button>
          )}
        </div>
        <p className="auth-note">Password hashata con PBKDF2. I dati restano in IndexedDB su questo dispositivo; puoi sincronizzare sul cloud da Profilo.</p>
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
  const [profile, setProfile] = useUserState<Profile>(session.accountId, "addome-profile", {
    name: session.name,
    age: 36,
    height: 178,
    weight: 76.2,
    goalWeight: 70,
    weeklyGoal: 4,
  });
  const [meals, setMeals] = useUserState<Meal[]>(session.accountId, "addome-meals", DEFAULT_MEALS);
  const [shopping, setShopping] = useUserState<ShoppingItem[]>(session.accountId, "addome-shopping", DEFAULT_SHOPPING);
  const [weightData, setWeightData] = useUserState(session.accountId, "addome-weight", WEIGHT_SEED);
  const [completedWorkout, setCompletedWorkout] = useUserState(session.accountId, "addome-workout-done", false);
  const [water, setWater] = useUserState(session.accountId, "addome-water", 5);
  const [steps, setSteps] = useUserState(session.accountId, "addome-steps", 6840);
  const [voiceEnabled, setVoiceEnabled] = useUserState(session.accountId, "addome-voice", true);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const consumed = meals.filter((meal) => meal.checked).reduce((sum, meal) => sum + meal.calories, 0);
  const target = calorieTarget(profile);

  useEffect(() => {
    if (profile.name !== session.name) {
      void updateAccountName(session.accountId, profile.name).then((next) => {
        if (next) onSessionChange(next);
      });
    }
  }, [profile.name, session.accountId, session.name, onSessionChange]);

  const syncCloud = async (action: "pull" | "push") => {
    const snapshot = { profile, meals, shopping, weightData, water, steps, voiceEnabled, completedWorkout };
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          accountId: session.accountId,
          email: session.email,
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

  const renderView = () => {
    if (tab === "home") return <Dashboard profile={profile} steps={steps} setSteps={setSteps} water={water} setWater={setWater} consumed={consumed} target={target} workoutDone={completedWorkout} startWorkout={() => setWorkoutOpen(true)} goTo={setTab} />;
    if (tab === "workouts") return <Workouts startWorkout={() => setWorkoutOpen(true)} workoutDone={completedWorkout} />;
    if (tab === "nutrition") return <Nutrition userId={session.accountId} meals={meals} setMeals={setMeals} shopping={shopping} setShopping={setShopping} target={target} />;
    if (tab === "progress") return <ProgressAndHealth profile={profile} weightData={weightData} setWeightData={setWeightData} />;
    if (tab === "coach") return <Coach userId={session.accountId} profile={profile} voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled} />;
    return (
      <ProfileView
        userId={session.accountId}
        profile={profile}
        setProfile={setProfile}
        target={target}
        voiceEnabled={voiceEnabled}
        setVoiceEnabled={setVoiceEnabled}
        openEditor={() => setProfileOpen(true)}
        exportData={() => exportAllData({ profile, meals, shopping, weightData, water, steps })}
        email={session.email}
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
        <button className="brand" onClick={() => setTab("home")} aria-label="Vai alla home di GYM & FOOD"><span className="brand-mark"><Dumbbell className="brand-gym-icon" size={22} /><Utensils className="brand-food-icon" size={17} /></span><span className="brand-copy"><strong><b>GYM</b><i>&</i><b>FOOD</b></strong><small>TRAIN · EAT · EVOLVE</small></span></button>
        <nav className="side-nav" aria-label="Navigazione principale"><span className="nav-caption">PERCORSO</span>{NAV.map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={20} strokeWidth={2.1} /><span>{label}</span>{key === "coach" && <i className="nav-new">AI</i>}</button>)}</nav>
        <div className="rail-card"><span className="rail-card-icon"><Sparkles size={17} /></span><strong>Settimana 4</strong><p>La base è solida. Questa settimana consolidiamo tecnica e ritmo.</p><div className="mini-progress"><span style={{ width: "33%" }} /></div><small>4 di 12</small></div>
        <button className="rail-profile" onClick={() => setProfileOpen(true)}><span className="avatar">{initials(profile.name)}</span><span><strong>{profile.name}</strong><small>{session.email}</small></span><Settings2 size={17} /></button>
      </aside>
      <div className="app-body"><header className="topbar"><div className="topbar-date"><span>MERCOLEDÌ</span><strong>23 SETTEMBRE</strong></div><div className="top-actions"><div className="device-pill"><Watch size={17} /><span>Watch</span><i /></div><button className="icon-button" aria-label="Cerca" onClick={() => toast("La ricerca globale sarà disponibile nel prossimo aggiornamento")}><Search size={19} /></button><button className="profile-chip" onClick={() => setProfileOpen(true)}><span>{initials(profile.name)}</span></button></div></header><main className="main-surface">{renderView()}</main></div>
      <nav className="mobile-nav" aria-label="Navigazione mobile">{NAV.map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={20} /><span>{label === "Alimentazione" ? "Cibo" : label}</span></button>)}</nav>
      <GuidedWorkout open={workoutOpen} onOpenChange={setWorkoutOpen} voiceEnabled={voiceEnabled} onComplete={() => { setCompletedWorkout(true); setWorkoutOpen(false); toast.success("Allenamento completato: 186 kcal stimate"); }} />
      <ProfileEditor open={profileOpen} onOpenChange={setProfileOpen} profile={profile} setProfile={setProfile} />
      <Toaster position="top-center" richColors />
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function Dashboard({ profile, steps, setSteps, water, setWater, consumed, target, workoutDone, startWorkout, goTo }: { profile: Profile; steps: number; setSteps: (value: number) => void; water: number; setWater: (value: number) => void; consumed: number; target: number; workoutDone: boolean; startWorkout: () => void; goTo: (tab: TabKey) => void }) {
  const dailyProgress = Math.min(100, Math.round(((Number(workoutDone) + Math.min(water / 8, 1) + Math.min(steps / 9000, 1)) / 3) * 100));
  return <div className="page-stack">
    <PageHeading eyebrow="OGGI · GYM & FOOD" title={`Ciao ${profile.name}, continuiamo così.`} description="Il piano di oggi è calibrato sul recupero e sull’obiettivo settimanale." action={<div className="streak"><Flame size={18} /><strong>12</strong><span>giorni</span></div>} />
    <section className="dashboard-hero"><div className="hero-copy"><span className="status-badge"><span /> GYM PLAN · OGGI</span><h2>Allenati. Nutriti. Migliora.</h2><p>Core e stabilità con riscaldamento mirato, stretching specifico e nutrizione coordinata al tuo obiettivo.</p><div className="hero-meta"><span><Clock3 size={16} /> 24 min</span><span><Flame size={16} /> 186 kcal</span><span><Utensils size={16} /> Piano cibo attivo</span></div><button className="primary-button inverse" onClick={startWorkout}>{workoutDone ? <><RotateCcw size={18} /> Ripeti allenamento</> : <><Play size={18} fill="currentColor" /> Inizia ora</>}</button></div><div className="hero-score"><div className="score-ring" style={{ "--score": `${dailyProgress * 3.6}deg` } as React.CSSProperties}><span><strong>{dailyProgress}</strong><small>%</small></span></div><p>Equilibrio di oggi</p></div></section>
    <section className="metric-grid"><MetricCard icon={Footprints} label="Passi" value={steps.toLocaleString("it-IT")} sub="Obiettivo 9.000" progress={(steps / 9000) * 100} tone="blue" action={() => setSteps(Math.min(20000, steps + 500))} /><MetricCard icon={Utensils} label="Calorie" value={`${consumed}`} unit={`/${target} kcal`} sub={`${Math.max(target - consumed, 0)} kcal disponibili`} progress={(consumed / target) * 100} tone="orange" action={() => goTo("nutrition")} /><MetricCard icon={HeartPulse} label="Battito" value="60" unit="bpm" sub="A riposo · da Watch" progress={71} tone="red" action={() => goTo("progress")} /><MetricCard icon={Activity} label="Acqua" value={`${water}`} unit="/8 bicchieri" sub="Idratazione di oggi" progress={(water / 8) * 100} tone="teal" action={() => setWater(Math.min(8, water + 1))} /></section>
    <section className="two-column"><article className="surface-card schedule-card"><div className="card-head"><div><span className="card-kicker">IL TUO PERCORSO</span><h3>Settimana 4 di 12</h3></div><button className="text-button" onClick={() => goTo("workouts")}>Programma <ChevronRight size={16} /></button></div><WeekTrack /><div className="week-callout"><Target size={21} /><div><strong>Focus della settimana</strong><p>Controllo del core e qualità del movimento. Aumenta solo se la tecnica resta pulita.</p></div></div></article><article className="surface-card daily-plan"><div className="card-head"><div><span className="card-kicker">CHECK-IN</span><h3>Il tuo ritmo oggi</h3></div><span className="soft-badge">3 obiettivi</span></div><CheckRow done={workoutDone} label="Allenamento core" detail="24 min" onClick={startWorkout} /><CheckRow done={water >= 8} label="8 bicchieri d’acqua" detail={`${water}/8`} onClick={() => setWater(Math.min(8, water + 1))} /><CheckRow done={steps >= 9000} label="9.000 passi" detail={steps.toLocaleString("it-IT")} onClick={() => setSteps(Math.min(20000, steps + 500))} /></article></section>
  </div>;
}

function MetricCard({ icon: Icon, label, value, unit, sub, progress, tone, action }: { icon: LucideIcon; label: string; value: string; unit?: string; sub: string; progress: number; tone: string; action: () => void }) { return <button className={`metric-card ${tone}`} onClick={action}><span className="metric-icon"><Icon size={20} /></span><div className="metric-copy"><span>{label}</span><strong>{value}<small>{unit}</small></strong><p>{sub}</p></div><Progress value={Math.min(progress, 100)} className="metric-progress" /></button>; }
function WeekTrack() { return <div className="week-track" aria-label="Progresso del programma di 12 settimane">{Array.from({ length: 12 }, (_, index) => index + 1).map((week) => <div className={week < 4 ? "done" : week === 4 ? "current" : ""} key={week}><span>{week < 4 ? <Check size={12} /> : week}</span>{week === 4 && <small>ORA</small>}</div>)}</div>; }
function CheckRow({ done, label, detail, onClick }: { done: boolean; label: string; detail: string; onClick: () => void }) { return <button className="check-row" onClick={onClick}><span className={done ? "check-circle done" : "check-circle"}>{done && <Check size={15} />}</span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={17} /></button>; }

function Workouts({ startWorkout, workoutDone }: { startWorkout: () => void; workoutDone: boolean }) {
  const [difficulty, setDifficulty] = useState("Bilanciato");
  const note = difficulty === "Più facile" ? "Riduciamo le tenute a 20 secondi e inseriamo più recupero." : difficulty === "Più intenso" ? "Aggiungiamo una serie a Dead Bug e Bird Dog, mantenendo invariati riscaldamento e stretching." : "Il carico attuale è coerente con il tuo recupero. Dopo la sessione dimmi com’è andata.";
  return <div className="page-stack"><PageHeading eyebrow="PROGRAMMA" title="Allenamenti che crescono con te" description="Il piano si adatta al feedback, senza sacrificare tecnica, riscaldamento o recupero." action={<button className="primary-button" onClick={startWorkout}><Play size={18} fill="currentColor" /> {workoutDone ? "Ripeti sessione" : "Inizia sessione"}</button>} />
    <section className="workout-top-grid"><article className="workout-feature"><div className="feature-top"><span className="status-badge light"><span /> ALLENAMENTO DI OGGI</span><span className="soft-badge">Core</span></div><h2>Stabilità addominale</h2><p>24 minuti · 3 fasi · 13 timer effettivi</p><div className="phase-line"><div><span className="phase-dot warm" /><strong>Riscaldamento</strong><small>3 esercizi mirati</small></div><div><span className="phase-dot active" /><strong>Allenamento</strong><small>Side plank: 6 timer</small></div><div><span className="phase-dot cool" /><strong>Stretching</strong><small>4 esercizi core</small></div></div><button className="primary-button inverse" onClick={startWorkout}><CirclePlay size={19} /> Apri allenamento guidato</button></article><article className="surface-card adaptive-card"><span className="card-kicker">ADATTAMENTO</span><h3>Intensità consigliata</h3><div className="segment-control">{["Più facile", "Bilanciato", "Più intenso"].map((option) => <button key={option} className={difficulty === option ? "active" : ""} onClick={() => setDifficulty(option)}>{option}</button>)}</div><div className="coach-note"><Sparkles size={19} /><p>{note}</p></div></article></section>
    <section className="surface-card plan-list-card"><div className="card-head"><div><span className="card-kicker">STRUTTURA COMPLETA</span><h3>Sessione addome e obliqui</h3></div><span className="soft-badge"><TimerReset size={14} /> Riavvio disponibile</span></div><div className="phase-block"><PhaseHeader number="01" title="Riscaldamento" subtitle="Specifico per core, bacino e colonna" color="warm" />{WARMUP.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} />)}</div><div className="phase-block"><PhaseHeader number="02" title="Allenamento" subtitle="Tre serie per lato nel Side Plank" color="active" />{MAIN_EXERCISES.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} compact />)}</div><div className="phase-block"><PhaseHeader number="03" title="Stretching finale" subtitle="Addome, obliqui, dorsali e respirazione" color="cool" />{COOLDOWN.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} />)}</div></section>
  </div>;
}
function PhaseHeader({ number, title, subtitle, color }: { number: string; title: string; subtitle: string; color: string }) { return <div className={`phase-header ${color}`}><span>{number}</span><div><strong>{title}</strong><small>{subtitle}</small></div></div>; }
function ExerciseRow({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) { return <div className="exercise-row"><span className="exercise-play"><Play size={14} fill="currentColor" /></span><div><strong>{exercise.name}{exercise.side ? ` · ${exercise.side}` : ""}</strong><small>{exercise.focus}</small></div>{exercise.set && <span className="set-badge">Serie {exercise.set}</span>}<span className="duration"><Clock3 size={14} /> {exercise.seconds}s</span>{!compact && <a href={`https://www.youtube.com/watch?v=${exercise.videoId}`} target="_blank" rel="noreferrer" aria-label={`Apri il video di ${exercise.name}`}><Video size={17} /></a>}</div>; }

function Nutrition({ userId, meals, setMeals, shopping, setShopping, target }: { userId: string; meals: Meal[]; setMeals: (meals: Meal[]) => void; shopping: ShoppingItem[]; setShopping: (items: ShoppingItem[]) => void; target: number }) {
  const [addMealOpen, setAddMealOpen] = useState(false); const [newMeal, setNewMeal] = useState({ slot: "Pranzo", name: "", calories: "", protein: "" }); const [newShopping, setNewShopping] = useState(""); const [favorites, setFavorites] = useUserState<string[]>(userId, "addome-favorites", ["r1"]);
  const totals = meals.filter((meal) => meal.checked).reduce((sum, meal) => ({ calories: sum.calories + meal.calories, protein: sum.protein + meal.protein, carbs: sum.carbs + meal.carbs, fat: sum.fat + meal.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const addMeal = () => { if (!newMeal.name || !newMeal.calories) return; setMeals([...meals, { id: crypto.randomUUID(), slot: newMeal.slot, name: newMeal.name, calories: Number(newMeal.calories), protein: Number(newMeal.protein || 0), carbs: 0, fat: 0, checked: true }]); setNewMeal({ slot: "Pranzo", name: "", calories: "", protein: "" }); setAddMealOpen(false); toast.success("Alimento aggiunto al diario"); };
  return <div className="page-stack"><PageHeading eyebrow="ALIMENTAZIONE" title="Mangia bene, senza complicarti la vita" description="Diario, ricette e spesa lavorano insieme sul tuo obiettivo calorico." action={<button className="primary-button" onClick={() => setAddMealOpen(true)}><Plus size={18} /> Aggiungi alimento</button>} />
    <section className="nutrition-hero"><img src="/mediterranean-bowl.jpg" alt="Bowl mediterranea bilanciata con pollo, verdure, avocado, riso e ceci" /><div className="nutrition-overlay"><span className="status-badge light"><Sparkles size={13} /> SCELTA DEL GIORNO</span><h2>Bowl mediterranea proteica</h2><p>Un pasto completo che copre proteine, fibre e carboidrati complessi.</p><button onClick={() => toast.success("Ricetta salvata nel piano di oggi")}>Usa nel piano <ArrowRight size={17} /></button></div></section>
    <Tabs defaultValue="today" className="nutrition-tabs"><TabsList className="premium-tabs"><TabsTrigger value="today">Diario di oggi</TabsTrigger><TabsTrigger value="recipes">Ricette</TabsTrigger><TabsTrigger value="shopping">Lista della spesa</TabsTrigger></TabsList>
      <TabsContent value="today" className="tab-panel"><section className="macro-layout"><article className="surface-card calories-card"><div className="calorie-ring" style={{ "--score": `${Math.min(totals.calories / target, 1) * 360}deg` } as React.CSSProperties}><span><small>consumate</small><strong>{totals.calories}</strong><em>di {target} kcal</em></span></div><div className="macro-bars"><MacroLine label="Proteine" value={totals.protein} target={135} color="var(--orange)" /><MacroLine label="Carboidrati" value={totals.carbs} target={210} color="#4069d7" /><MacroLine label="Grassi" value={totals.fat} target={65} color="#1b9c75" /></div></article><article className="surface-card smart-add"><span className="card-kicker">AGGIUNTA RAPIDA</span><h3>Registra quello che mangi</h3><div className="quick-actions"><button onClick={() => { setMeals([...meals, { id: crypto.randomUUID(), slot: "Pranzo", name: "Piatto fotografato · stima locale", calories: 520, protein: 34, carbs: 52, fat: 17, checked: true }]); toast.success("Piatto stimato e aggiunto"); }}><Camera size={20} /><span><strong>Fotografa il piatto</strong><small>Stima porzioni e macro</small></span></button><button onClick={() => toast("Inserisci il codice nella ricerca alimenti")}><Square size={20} /><span><strong>Codice a barre</strong><small>Cerca un prodotto</small></span></button></div></article></section>
      <section className="surface-card meal-card"><div className="card-head"><div><span className="card-kicker">PIANO GIORNALIERO</span><h3>I tuoi pasti</h3></div><span className="soft-badge">{meals.filter((m) => m.checked).length}/{meals.length} registrati</span></div><div className="meal-list">{meals.map((meal) => <button key={meal.id} className={meal.checked ? "meal-row eaten" : "meal-row"} onClick={() => setMeals(meals.map((item) => item.id === meal.id ? { ...item, checked: !item.checked } : item))}><span className="meal-time">{meal.slot}</span><span className="meal-check">{meal.checked && <Check size={14} />}</span><span className="meal-name"><strong>{meal.name}</strong><small>P {meal.protein}g · C {meal.carbs}g · G {meal.fat}g</small></span><strong className="meal-kcal">{meal.calories}<small> kcal</small></strong></button>)}</div></section></TabsContent>
      <TabsContent value="recipes" className="tab-panel"><section className="recipe-grid">{RECIPES.map((recipe, index) => <article className="recipe-card" key={recipe.id}><div className={`recipe-visual recipe-${index + 1}`}><Utensils size={27} /><button onClick={() => setFavorites(favorites.includes(recipe.id) ? favorites.filter((id) => id !== recipe.id) : [...favorites, recipe.id])}><Star size={18} fill={favorites.includes(recipe.id) ? "currentColor" : "none"} /></button></div><div className="recipe-copy"><div className="recipe-tags">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>{recipe.name}</h3><p><Clock3 size={15} /> {recipe.time}<span />{recipe.calories} kcal<span />{recipe.protein}g proteine</p><button onClick={() => toast.success("Ricetta aggiunta al piano")}>Apri ricetta <ChevronRight size={16} /></button></div></article>)}</section></TabsContent>
      <TabsContent value="shopping" className="tab-panel"><section className="surface-card shopping-card"><div className="card-head"><div><span className="card-kicker">SPESA INTELLIGENTE</span><h3>Generata dal piano settimanale</h3></div><span className="soft-badge">{shopping.filter((item) => item.checked).length}/{shopping.length}</span></div><div className="shopping-input"><Input value={newShopping} onChange={(event) => setNewShopping(event.target.value)} placeholder="Aggiungi un prodotto" onKeyDown={(event) => { if (event.key === "Enter" && newShopping.trim()) { setShopping([...shopping, { id: crypto.randomUUID(), name: newShopping.trim(), category: "Altro", checked: false }]); setNewShopping(""); } }} /><button className="primary-button compact" onClick={() => { if (newShopping.trim()) { setShopping([...shopping, { id: crypto.randomUUID(), name: newShopping.trim(), category: "Altro", checked: false }]); setNewShopping(""); } }}><Plus size={17} /> Aggiungi</button></div><div className="shopping-list">{shopping.map((item) => <div className={item.checked ? "shopping-row checked" : "shopping-row"} key={item.id}><button className="check-circle" onClick={() => setShopping(shopping.map((entry) => entry.id === item.id ? { ...entry, checked: !entry.checked } : entry))}>{item.checked && <Check size={14} />}</button><span><strong>{item.name}</strong><small>{item.category}</small></span><button aria-label={`Elimina ${item.name}`} onClick={() => setShopping(shopping.filter((entry) => entry.id !== item.id))}><Trash2 size={17} /></button></div>)}</div></section></TabsContent>
    </Tabs>
    <Dialog open={addMealOpen} onOpenChange={setAddMealOpen}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>Aggiungi un alimento</DialogTitle><DialogDescription>Inserisci una stima semplice. Potrai correggerla in qualsiasi momento.</DialogDescription></DialogHeader><div className="form-stack"><label>Momento del giorno<div className="segment-control">{["Colazione", "Pranzo", "Cena", "Spuntino"].map((slot) => <button key={slot} className={newMeal.slot === slot ? "active" : ""} onClick={() => setNewMeal({ ...newMeal, slot })}>{slot}</button>)}</div></label><label>Alimento<Input value={newMeal.name} onChange={(event) => setNewMeal({ ...newMeal, name: event.target.value })} placeholder="es. Pasta integrale al pomodoro" /></label><div className="form-grid"><label>Calorie<Input type="number" value={newMeal.calories} onChange={(event) => setNewMeal({ ...newMeal, calories: event.target.value })} /></label><label>Proteine (g)<Input type="number" value={newMeal.protein} onChange={(event) => setNewMeal({ ...newMeal, protein: event.target.value })} /></label></div><button className="primary-button full" onClick={addMeal}>Aggiungi al diario</button></div></DialogContent></Dialog>
  </div>;
}
function MacroLine({ label, value, target, color }: { label: string; value: number; target: number; color: string }) { return <div className="macro-line"><div><span>{label}</span><strong>{value}<small>/{target}g</small></strong></div><div><span style={{ width: `${Math.min((value / target) * 100, 100)}%`, background: color }} /></div></div>; }

function ProgressAndHealth({ profile, weightData, setWeightData }: { profile: Profile; weightData: { date: string; value: number }[]; setWeightData: (data: { date: string; value: number }[]) => void }) {
  const [view, setView] = useState("progress"); const [weight, setWeight] = useState(""); const [photo, setPhoto] = useState<string | null>(null); const lastWeight = weightData.at(-1)?.value ?? profile.weight; const lost = profile.weight - lastWeight;
  return <div className="page-stack"><PageHeading eyebrow="RISULTATI & SALUTE" title="I numeri che contano davvero" description="Peso, misure, frequenza cardiaca e recupero letti nello stesso contesto." action={<div className="segment-control heading-segment"><button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}>Progressi</button><button className={view === "health" ? "active" : ""} onClick={() => setView("health")}>Salute</button></div>} />
    {view === "progress" ? <><section className="summary-grid"><SummaryCard label="Peso attuale" value={`${lastWeight.toFixed(1)} kg`} detail={`${lost.toFixed(1)} kg dall’inizio`} icon={TrendingDown} tone="orange" /><SummaryCard label="Girovita" value="84 cm" detail="−4 cm in 4 settimane" icon={Target} tone="blue" /><SummaryCard label="Allenamenti" value="15" detail="88% completati" icon={Dumbbell} tone="green" /><SummaryCard label="Costanza" value="12 giorni" detail="Record personale" icon={Flame} tone="orange" /></section><section className="two-column chart-layout"><article className="surface-card chart-card"><div className="card-head"><div><span className="card-kicker">ANDAMENTO</span><h3>Peso corporeo</h3></div><div className="inline-add"><Input type="number" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="kg" /><button onClick={() => { if (weight) { setWeightData([...weightData, { date: "Oggi", value: Number(weight) }]); setWeight(""); toast.success("Peso registrato"); } }}><Plus size={17} /></button></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weightData}><defs><linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5b17" stopOpacity={0.25} /><stop offset="100%" stopColor="#ff5b17" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ece5dc" /><XAxis dataKey="date" axisLine={false} tickLine={false} /><YAxis domain={[68, 80]} axisLine={false} tickLine={false} width={32} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#ff5b17" strokeWidth={3} fill="url(#weightFill)" dot={{ r: 4, fill: "#fff", stroke: "#ff5b17", strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div></article><article className="surface-card photo-card"><div className="card-head"><div><span className="card-kicker">FOTO PROGRESSO</span><h3>Confronta nel tempo</h3></div></div>{photo ? <img src={photo} alt="Foto progresso caricata" /> : <div className="photo-placeholder"><Camera size={28} /><strong>Aggiungi una foto</strong><p>Resta solo nel browser di questo dispositivo.</p></div>}<label className="secondary-button full"><Upload size={17} /> {photo ? "Sostituisci foto" : "Carica foto"}<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) setPhoto(URL.createObjectURL(file)); }} /></label></article></section><section className="surface-card review-card"><div className="review-score"><strong>8.6</strong><span>/10</span></div><div><span className="card-kicker">REVISIONE SETTIMANALE</span><h3>Stai progredendo al ritmo giusto</h3><p>La costanza è alta e la perdita di peso è graduale. Manteniamo il volume attuale e aumentiamo una sola serie la prossima settimana se il recupero resta buono.</p></div><button className="text-button">Apri revisione <ChevronRight size={16} /></button></section></> : <><section className="summary-grid"><SummaryCard label="Battito a riposo" value="60 bpm" detail="−4 bpm in 30 giorni" icon={HeartPulse} tone="red" /><SummaryCard label="Calorie attive" value="486 kcal" detail="Obiettivo 550 kcal" icon={Flame} tone="orange" /><SummaryCard label="Sonno" value="7h 38m" detail="Qualità buona" icon={Activity} tone="blue" /><SummaryCard label="BMI" value={bmi(profile).toFixed(1)} detail="Intervallo di riferimento" icon={Target} tone="green" /></section><section className="two-column chart-layout"><article className="surface-card chart-card"><div className="card-head"><div><span className="card-kicker">APPLE WATCH</span><h3>Frequenza cardiaca</h3></div><span className="sync-badge"><span /> Sincronizzato</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={HEART_SEED}><CartesianGrid vertical={false} stroke="#ece5dc" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis domain={[50, 155]} axisLine={false} tickLine={false} width={32} /><Tooltip /><Line type="monotone" dataKey="workout" name="Allenamento" stroke="#eb4560" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="rest" name="Riposo" stroke="#445bd5" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="pink" /> Allenamento</span><span><i className="blue" /> Riposo</span></div></article><article className="surface-card health-insights"><span className="card-kicker">INSIGHT</span><h3>Recupero positivo</h3><div className="health-score"><span>82</span><div><strong>Prontezza alta</strong><p>Battito a riposo e sonno indicano un buon recupero.</p></div></div><ul><li><Check size={15} /> Frequenza cardiaca nella tua norma</li><li><Check size={15} /> Sonno superiore alla media settimanale</li><li><Check size={15} /> Nessun segnale di sovraccarico</li></ul><button className="secondary-button full" onClick={() => toast.success("Dati salute aggiornati")}><RefreshCw size={17} /> Aggiorna dati</button></article></section></>}
  </div>;
}
function SummaryCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: LucideIcon; tone: string }) { return <article className={`summary-card ${tone}`}><span><Icon size={20} /></span><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>; }

function Coach({ userId, profile, voiceEnabled, setVoiceEnabled }: { userId: string; profile: Profile; voiceEnabled: boolean; setVoiceEnabled: (value: boolean) => void }) {
  const [messages, setMessages] = useUserState<CoachMessage[]>(userId, "addome-coach", [{ id: "welcome", role: "coach", text: `Ciao ${profile.name}. Oggi hai una sessione core di 24 minuti. Come ti senti?` }]); const [draft, setDraft] = useState(""); const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  const answer = (text: string) => { const lower = text.toLowerCase(); if (lower.includes("schiena") || lower.includes("dolore")) return "Se senti dolore vero, interrompi. Per oggi sostituisci il Side Plank con Bird Dog e riduci le tenute a 20 secondi. Se il dolore persiste, confrontati con un professionista sanitario."; if (lower.includes("mang") || lower.includes("fame") || lower.includes("cena")) return "Ti restano circa 1.190 kcal nel piano di oggi. Per cena scegli una fonte proteica, verdure e una porzione di carboidrati: ad esempio salmone, patate e insalata."; if (lower.includes("stanco") || lower.includes("sonno")) return "Il recupero risulta buono, ma ascolta la percezione reale: prova il riscaldamento e, se resti scarico, scegli l’intensità più facile senza saltare lo stretching."; if (lower.includes("aument") || lower.includes("difficile")) return "Dopo la sessione registrerò il tuo feedback. Se due allenamenti consecutivi risultano facili, aumenterò una serie; se sono troppo impegnativi, ridurrò tempi o sostituirò l’esercizio."; return "Ricevuto. Tengo conto di questo feedback nel prossimo allenamento. Vuoi che adatti l’intensità, l’esercizio o la durata?"; };
  const send = (preset?: string) => { const text = (preset ?? draft).trim(); if (!text) return; const response = answer(text); setMessages([...messages, { id: crypto.randomUUID(), role: "user", text }, { id: crypto.randomUUID(), role: "coach", text: response }]); setDraft(""); if (voiceEnabled && "speechSynthesis" in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(response); utterance.lang = "it-IT"; utterance.rate = 0.98; window.speechSynthesis.speak(utterance); } };
  return <div className="page-stack coach-page"><PageHeading eyebrow="COACH" title="Il tuo supporto quotidiano" description="Chiedi indicazioni su allenamento, alimentazione, recupero e adattamenti." action={<label className="voice-control">{voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />} Voce <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} /></label>} /><section className="coach-layout"><article className="chat-card"><div className="chat-head"><span className="coach-avatar"><Bot size={23} /></span><div><strong>Coach GYM & FOOD</strong><small><span /> Online · conosce il tuo piano</small></div></div><div className="messages">{messages.map((message) => <div key={message.id} className={`message ${message.role}`}><span>{message.role === "coach" ? <Bot size={17} /> : initials(profile.name)}</span><p>{message.text}</p></div>)}<div ref={endRef} /></div><div className="suggestions">{["Sono stanco oggi", "Cosa mangio a cena?", "Aumenta la difficoltà"].map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)}>{suggestion}</button>)}</div><div className="composer"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Scrivi al tuo coach…" /><button onClick={() => send()} aria-label="Invia messaggio"><Send size={19} /></button></div></article><aside className="coach-context"><article className="surface-card"><span className="card-kicker">CONTESTO DI OGGI</span><h3>Cosa vede il coach</h3><ContextRow icon={HeartPulse} label="Recupero" value="82 · alto" /><ContextRow icon={Dumbbell} label="Sessione" value="Core · 24 min" /><ContextRow icon={Utensils} label="Calorie" value="590 / 1.780" /><ContextRow icon={Footprints} label="Passi" value="6.840" /></article><article className="surface-card privacy-note"><span><Check size={17} /></span><div><strong>Dati sotto controllo</strong><p>Le conversazioni e le preferenze restano salvate nel browser.</p></div></article></aside></section></div>;
}
function ContextRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) { return <div className="context-row"><span><Icon size={17} /></span><small>{label}</small><strong>{value}</strong></div>; }

function ProfileView({ userId, profile, setProfile, target, voiceEnabled, setVoiceEnabled, openEditor, exportData, email, onLogout, onCloudPush, onCloudPull }: { userId: string; profile: Profile; setProfile: (profile: Profile) => void; target: number; voiceEnabled: boolean; setVoiceEnabled: (value: boolean) => void; openEditor: () => void; exportData: () => void; email: string; onLogout: () => void | Promise<void>; onCloudPush: () => void; onCloudPull: () => void }) {
  const currentBmi = bmi(profile);
  const [autoAdapt, setAutoAdapt] = useUserState(userId, "addome-auto-adapt", true);
  return <div className="page-stack"><PageHeading eyebrow="PROFILO" title="Il tuo percorso, alle tue condizioni" description="Obiettivi, preferenze e dati personali in un unico posto." action={<button className="secondary-button" onClick={openEditor}><Settings2 size={17} /> Modifica profilo</button>} /><section className="profile-banner"><span className="profile-avatar-large">{initials(profile.name)}</span><div><h2>{profile.name}</h2><p>{email}</p><div><span><Flame size={15} /> 12 giorni</span><span><Star size={15} /> 1.840 XP</span><span><Dumbbell size={15} /> 15 workout</span></div></div><span className="premium-pill"><Sparkles size={15} /> PREMIUM</span></section><section className="summary-grid"><SummaryCard label="Obiettivo peso" value={`${profile.goalWeight} kg`} detail={`${(profile.weight - profile.goalWeight).toFixed(1)} kg rimanenti`} icon={Target} tone="orange" /><SummaryCard label="BMI attuale" value={currentBmi.toFixed(1)} detail={currentBmi < 25 ? "Intervallo nella norma" : "Da leggere con il contesto"} icon={Activity} tone="blue" /><SummaryCard label="Obiettivo calorie" value={`${target} kcal`} detail="Deficit moderato stimato" icon={Flame} tone="orange" /><SummaryCard label="Allenamenti" value={`${profile.weeklyGoal}/sett.`} detail="Obiettivo personale" icon={Dumbbell} tone="green" /></section><section className="settings-layout"><article className="surface-card settings-card"><div className="card-head"><div><span className="card-kicker">PREFERENZE</span><h3>Esperienza</h3></div></div><SettingRow icon={Volume2} label="Guida vocale" detail="Istruzioni durante gli esercizi" control={<Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />} /><SettingRow icon={Watch} label="Dati Apple Watch" detail="Battito e calorie registrati" control={<span className="sync-badge"><span /> Attivo</span>} /><SettingRow icon={Sparkles} label="Adattamento automatico" detail="Serie ed esercizi seguono il feedback" control={<Switch checked={autoAdapt} onCheckedChange={setAutoAdapt} />} /></article><article className="surface-card settings-card"><div className="card-head"><div><span className="card-kicker">I TUOI DATI</span><h3>Backup, cloud e account</h3></div></div><button className="settings-action" onClick={exportData}><Download size={18} /><span><strong>Esporta backup</strong><small>Scarica profilo e progressi in JSON</small></span><ChevronRight size={17} /></button><label className="settings-action"><Upload size={18} /><span><strong>Importa backup</strong><small>Ripristina dati da un file</small></span><ChevronRight size={17} /><input type="file" accept="application/json" hidden onChange={(event) => importBackup(event, setProfile)} /></label><button className="settings-action" onClick={onCloudPush}><RefreshCw size={18} /><span><strong>Carica sul cloud</strong><small>Sincronizza via API /api/sync</small></span><ChevronRight size={17} /></button><button className="settings-action" onClick={onCloudPull}><Download size={18} /><span><strong>Scarica dal cloud</strong><small>Ripristina l’ultimo sync remoto</small></span><ChevronRight size={17} /></button><button className="settings-action danger" onClick={() => void onLogout()}><Trash2 size={18} /><span><strong>Esci dall’account</strong><small>I dati restano salvati su questo dispositivo</small></span><ChevronRight size={17} /></button></article></section></div>;
}
function SettingRow({ icon: Icon, label, detail, control }: { icon: LucideIcon; label: string; detail: string; control: React.ReactNode }) { return <div className="setting-row"><span><Icon size={18} /></span><div><strong>{label}</strong><small>{detail}</small></div>{control}</div>; }

function GuidedWorkout({ open, onOpenChange, voiceEnabled, onComplete }: { open: boolean; onOpenChange: (open: boolean) => void; voiceEnabled: boolean; onComplete: () => void }) {
  const [index, setIndex] = useState(0); const [seconds, setSeconds] = useState(WORKOUT_QUEUE[0].seconds); const [running, setRunning] = useState(false); const [videoOpen, setVideoOpen] = useState(false); const [finished, setFinished] = useState(false); const [feedback, setFeedback] = useState(""); const exercise = WORKOUT_QUEUE[index];
  const speak = (message: string) => { if (!voiceEnabled || !("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(message); utterance.lang = "it-IT"; utterance.rate = 0.98; window.speechSynthesis.speak(utterance); };
  const moveTo = (next: number) => { if (next >= WORKOUT_QUEUE.length) { setRunning(false); setFinished(true); speak("Allenamento completato. Ottimo lavoro."); return; } const safe = Math.max(0, next); setIndex(safe); setSeconds(WORKOUT_QUEUE[safe].seconds); setVideoOpen(false); speak(`${WORKOUT_QUEUE[safe].stage}. ${WORKOUT_QUEUE[safe].name}. ${WORKOUT_QUEUE[safe].side ?? ""}. ${WORKOUT_QUEUE[safe].cue}`); };
  useEffect(() => { if (!running || finished) return; const timer = window.setInterval(() => { setSeconds((current) => { if (current <= 1) { window.clearInterval(timer); window.setTimeout(() => moveTo(index + 1), 250); return 0; } if (current === 4) speak("Tre, due, uno"); return current - 1; }); }, 1000); return () => window.clearInterval(timer); }, [running, index, finished]);
  useEffect(() => { if (!open) { setRunning(false); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } }, [open]);
  const resetAll = () => { setIndex(0); setSeconds(WORKOUT_QUEUE[0].seconds); setRunning(false); setFinished(false); setFeedback(""); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="workout-dialog" showCloseButton={false}>{!finished ? <><div className="workout-dialog-head"><div><span className={`stage-pill ${exercise.stage.toLowerCase()}`}>{exercise.stage}</span><small>{index + 1} di {WORKOUT_QUEUE.length}</small></div><button onClick={() => onOpenChange(false)} aria-label="Chiudi allenamento"><X size={20} /></button></div><Progress value={((index + 1) / WORKOUT_QUEUE.length) * 100} className="workout-progress" /><div className="workout-focus"><span className="exercise-count">{exercise.set ? `SERIE ${exercise.set}` : exercise.stage === "Riscaldamento" ? "PREPARAZIONE" : "RECUPERO"}</span><h2>{exercise.name}</h2>{exercise.side && <span className="side-label">Lato {exercise.side}</span>}<p>{exercise.focus}</p></div><div className="timer-ring" style={{ "--score": `${(seconds / exercise.seconds) * 360}deg` } as React.CSSProperties}><span><strong>{formatTimer(seconds)}</strong><small>{running ? "IN CORSO" : "IN PAUSA"}</small></span></div><div className="cue-card"><Sparkles size={18} /><p>{exercise.cue}</p></div><div className="workout-controls"><button className="round-button secondary" onClick={() => moveTo(index - 1)} disabled={index === 0}><ArrowLeft size={21} /></button><button className="round-button secondary" onClick={() => { setSeconds(exercise.seconds); setRunning(false); speak(`Ripartiamo da capo. ${exercise.name}`); }} title="Ricomincia esercizio"><RotateCcw size={21} /></button><button className="round-button main" onClick={() => { setRunning(!running); if (!running) speak(`${exercise.name}. ${exercise.cue}`); }}>{running ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button><button className="round-button secondary" onClick={() => setVideoOpen(true)} title="Video dimostrativo"><Video size={21} /></button><button className="round-button secondary" onClick={() => moveTo(index + 1)}><ArrowRight size={21} /></button></div><div className="workout-foot"><button onClick={() => { setSeconds(exercise.seconds); setRunning(true); }}><TimerReset size={17} /> Fatto male? Riparti dall’inizio</button><span>{exercise.stage === "Allenamento" && exercise.name === "Side Plank" ? "6 timer: 3 per lato" : "Video abbinato all’esercizio"}</span></div>{videoOpen && <DraggableVideo exercise={exercise} onClose={() => setVideoOpen(false)} />}</> : <div className="workout-complete"><span className="complete-icon"><Check size={34} /></span><span className="eyebrow">SESSIONE COMPLETATA</span><h2>Ottimo lavoro.</h2><p>Hai concluso riscaldamento, allenamento e stretching. Stima: 186 kcal.</p><div className="completion-stats"><div><strong>24</strong><small>minuti</small></div><div><strong>13</strong><small>timer</small></div><div><strong>137</strong><small>bpm medi</small></div></div><div className="feedback-box"><strong>Com’è stata l’intensità?</strong><div>{["Troppo facile", "Giusta", "Troppo intensa"].map((option) => <button className={feedback === option ? "active" : ""} key={option} onClick={() => setFeedback(option)}>{option}</button>)}</div>{feedback && <p>{feedback === "Troppo facile" ? "La prossima volta aggiungeremo una serie a Dead Bug e Bird Dog." : feedback === "Troppo intensa" ? "La prossima volta ridurremo le tenute e proporremo una variante più semplice." : "Manteniamo questo equilibrio e progrediamo gradualmente."}</p>}</div><button className="primary-button full" onClick={onComplete}>Salva e chiudi</button><button className="text-button center" onClick={resetAll}><RotateCcw size={16} /> Ripeti da capo</button></div>}</DialogContent></Dialog>;
}

function DraggableVideo({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const [position, setPosition] = useState({ x: 24, y: 84 }); const drag = useRef({ x: 0, y: 0, active: false });
  return <div className="video-popup" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}><div className="video-handle" onPointerDown={(event) => { drag.current = { x: event.clientX - position.x, y: event.clientY - position.y, active: true }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag.current.active) setPosition({ x: Math.max(-10, Math.min(window.innerWidth - 380, event.clientX - drag.current.x)), y: Math.max(10, Math.min(window.innerHeight - 300, event.clientY - drag.current.y)) }); }} onPointerUp={() => { drag.current.active = false; }}><Move size={17} /><span>{exercise.name}{exercise.side ? ` · ${exercise.side}` : ""}</span><button onClick={onClose}><X size={17} /></button></div><iframe src={`https://www.youtube-nocookie.com/embed/${exercise.videoId}?rel=0&playsinline=1`} title={`Video dimostrativo: ${exercise.name}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>;
}

function ProfileEditor({ open, onOpenChange, profile, setProfile }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile; setProfile: (profile: Profile) => void }) {
  const [draft, setDraft] = useState(profile); useEffect(() => setDraft(profile), [profile, open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>Modifica profilo</DialogTitle><DialogDescription>Questi dati aggiornano BMI, calorie e progressione degli allenamenti.</DialogDescription></DialogHeader><div className="form-stack"><label>Nome<Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><div className="form-grid"><label>Età<Input type="number" value={draft.age} onChange={(event) => setDraft({ ...draft, age: Number(event.target.value) })} /></label><label>Altezza (cm)<Input type="number" value={draft.height} onChange={(event) => setDraft({ ...draft, height: Number(event.target.value) })} /></label><label>Peso attuale (kg)<Input type="number" step="0.1" value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: Number(event.target.value) })} /></label><label>Peso obiettivo (kg)<Input type="number" step="0.1" value={draft.goalWeight} onChange={(event) => setDraft({ ...draft, goalWeight: Number(event.target.value) })} /></label></div><label>Allenamenti a settimana<div className="stepper"><button onClick={() => setDraft({ ...draft, weeklyGoal: Math.max(1, draft.weeklyGoal - 1) })}><Minus size={17} /></button><strong>{draft.weeklyGoal}</strong><button onClick={() => setDraft({ ...draft, weeklyGoal: Math.min(7, draft.weeklyGoal + 1) })}><Plus size={17} /></button></div></label><button className="primary-button full" onClick={() => { setProfile(draft); onOpenChange(false); toast.success("Profilo aggiornato"); }}>Salva modifiche</button></div></DialogContent></Dialog>;
}

function exportAllData(data: unknown) { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `gym-food-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); toast.success("Backup esportato"); }
function importBackup(event: React.ChangeEvent<HTMLInputElement>, setProfile: (profile: Profile) => void) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); if (parsed?.data?.profile) { setProfile(parsed.data.profile as Profile); toast.success("Profilo importato dal backup"); } else toast.error("Il file non contiene un profilo valido"); } catch { toast.error("Backup non leggibile"); } }; reader.readAsText(file); }
