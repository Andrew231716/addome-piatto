import { useEffect, useState } from 'react';
import { Camera, Check, Plus, Trash2, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FOODS, FOOD_RECIPES, ingredientTotals, nutrientsFor, recipeMeal, shoppingFromMeals, type Nutrients } from '@/lib/foods';
import { lookupBarcodeOpenFoodFacts } from '@/lib/food-lookup';
import type { Meal, ShoppingItem } from '@/lib/plan';
import type { DayRecord } from '@/lib/history';
import { localDate, shiftDate } from '@/lib/dates';
const SLOTS = ['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena'];
const empty = { name: '', slot: 'Pranzo', grams: '100', calories: '', protein: '', carbs: '', fat: '', detail: 'Valori dell’etichetta per 100 g / 100 ml', source: 'manual' as 'manual' | 'barcode' };
function validNumbers(values: number[]) { return values.every(v => Number.isFinite(v) && v >= 0); }
export function NutritionDiary({ meals, setMeals, shopping, setShopping, target, macros, dietLabel, history, updateHistory, favorites, setFavorites, plans, setPlans, quickAdd, clearQuickAdd, excludedFoods = [] }: {
  meals: Meal[]; setMeals: (m: Meal[]) => void; shopping: ShoppingItem[]; setShopping: (s: ShoppingItem[]) => void;
  updateHistory: (date: string, meals: Meal[]) => void;
  favorites: Meal[]; setFavorites: (meals: Meal[]) => void;
  plans: Record<string, Meal[]>; setPlans: (plans: Record<string, Meal[]>) => void;
  excludedFoods?: string[];
  quickAdd: boolean; clearQuickAdd: () => void;
  target: number; macros: { protein: number; carbs: number; fat: number }; dietLabel: string; history: DayRecord[];
}) {
  const [date, setDate] = useState(localDate());
  const [shopStart, setShopStart] = useState(localDate());
  const [editingDate, setEditingDate] = useState(localDate());
  const [editor, setEditor] = useState<Meal | null>(null);
  const [draft, setDraft] = useState(empty);
  const [adding, setAdding] = useState(false);
  const [foodId, setFoodId] = useState(FOODS[0].id);
  const [barcode, setBarcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [shopDays, setShopDays] = useState(1);
  const [newShop, setNewShop] = useState('');
  const today = date === localDate();
  const day = history.find(d => d.date === date);
  const future = date > localDate();
  const entries = today ? meals : future ? plans[date] ?? [] : day?.meals ?? [];
  function saveEntries(next: Meal[], destination = date) {
    if (destination === localDate()) setMeals(next);
    else if (destination > localDate()) setPlans({ ...plans, [destination]: next });
    else updateHistory(destination, next);
  }
  function copyMeals(items: Meal[], checked = false) {
    return items.map(item => ({ ...item, checked, id: crypto.randomUUID() }));
  }
  const yesterday = history.find(item => item.date === shiftDate(localDate(), -1))?.meals.filter(item => item.checked) ?? [];
  const recents = [...new Map([...history].reverse().flatMap(item => item.meals.filter(meal => meal.checked)).reverse().map(meal => [meal.name + meal.slot, meal])).values()].reverse().slice(0, 6);
  useEffect(() => {
    if (!quickAdd) return;
    openAdd(localDate());
    clearQuickAdd();
  }, [quickAdd, clearQuickAdd]);
  const dayTarget = today ? target : day?.target ?? target;
  const totals = entries.filter(m => m.checked).reduce((s,m) => ({ calories: s.calories + m.calories, protein: s.protein + m.protein, carbs: s.carbs + m.carbs, fat: s.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  function openAdd(destination = date) { setEditingDate(destination); setDraft(empty); setEditor(null); setPhoto(null); setAdding(true); }
  function edit(meal: Meal) {
    setEditingDate(date);
    setEditor(meal); setPhoto(null);
    setDraft({ name: meal.name, slot: meal.slot, grams: String(meal.grams ?? 100), calories: String(meal.per100?.calories ?? meal.calories), protein: String(meal.per100?.protein ?? meal.protein), carbs: String(meal.per100?.carbs ?? meal.carbs), fat: String(meal.per100?.fat ?? meal.fat), detail: meal.per100 ? meal.detail ?? 'Valori per 100 g / 100 ml' : 'Valori totali del pasto', source: meal.source === 'barcode' ? 'barcode' : 'manual' });
    setAdding(true);
  }
  function save() {
    const n = { calories: Number(draft.calories), protein: Number(draft.protein), carbs: Number(draft.carbs), fat: Number(draft.fat) };
    const grams = Number(draft.grams);
    if (!draft.name.trim() || !draft.calories.trim() || !validNumbers(Object.values(n)) || n.calories > 9000 || !Number.isFinite(grams) || grams <= 0 || grams > 10000) return toast.error('Controlla nome, quantità e valori: usa numeri positivi.');
    const source = editingDate === localDate() ? meals : editingDate > localDate() ? plans[editingDate] ?? [] : history.find(item => item.date === editingDate)?.meals ?? [];
    if (editor?.ingredients) {
      saveEntries(source.map(m => m.id === editor.id ? { ...editor, name: draft.name.trim(), slot: draft.slot, ...ingredientTotals(editor.ingredients!) } : m), editingDate);
    } else {
      const per100 = !editor || !!editor.per100;
      const meal: Meal = { id: editor?.id ?? crypto.randomUUID(), name: draft.name.trim(), slot: draft.slot, ...(per100 ? nutrientsFor(n, grams) : n), checked: editor?.checked ?? editingDate <= localDate(), source: draft.source, ...(per100 ? { grams, per100: n, detail: draft.detail } : {}) };
      saveEntries(editor ? source.map(m => m.id === editor.id ? meal : m) : [...source, meal], editingDate);
    }
    setAdding(false); toast.success(editor ? 'Pasto aggiornato' : 'Alimento registrato');
  }
  function chooseFood() {
    const f = FOODS.find(f => f.id === foodId)!;
    setDraft({ ...draft, name: f.name, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat), detail: `Valori indicativi per 100 g · ${f.state}`, source: 'manual' });
  }
  async function lookup() {
    setBusy(true);
    try {
      const result = await lookupBarcodeOpenFoodFacts(barcode);
      if (!result) { toast.message('Prodotto non trovato: inserisci i valori dell’etichetta.'); return; }
      setDraft({ ...draft, name: result.name, calories: String(result.calories), protein: String(result.protein), carbs: String(result.carbs), fat: String(result.fat), detail: result.detail ?? '', source: 'barcode' });
    } catch { toast.error('Ricerca non disponibile. Puoi compilare l’etichetta a mano.'); }
    finally { setBusy(false); }
  }
  const previewN = nutrientsFor({ calories: Number(draft.calories) || 0, protein: Number(draft.protein) || 0, carbs: Number(draft.carbs) || 0, fat: Number(draft.fat) || 0 }, Number(draft.grams) || 0);
  return <div className="page-stack nutrition-page">
    <div className="page-heading"><div><span className="card-kicker">ALIMENTAZIONE · {dietLabel}</span><h1>Il tuo diario alimentare</h1><p>Quantità reali, ingredienti e pasti confermati da te.</p></div><button className="primary-button" onClick={() => openAdd()}><Plus size={18}/> Aggiungi alimento</button></div>
    <Tabs defaultValue="today"><TabsList className="premium-tabs"><TabsTrigger value="today">Diario e storico</TabsTrigger><TabsTrigger value="recipes">Ricette</TabsTrigger><TabsTrigger value="shopping">Spesa</TabsTrigger></TabsList>
    <TabsContent value="today" className="tab-panel">
      <section className="surface-card"><div className="card-head"><h3>{today ? "Oggi" : future ? "Pianifica pasti" : "Giornata archiviata"}</h3><div className="diary-date-controls"><button className="secondary-button compact" aria-label="Giorno precedente" onClick={()=>setDate(shiftDate(date,-1))}>←</button><label>Data<Input aria-label="Data del diario" type="date" value={date} onInput={e => setDate(e.currentTarget.value || localDate())} onChange={e => setDate(e.target.value || localDate())}/></label><button className="secondary-button compact" aria-label="Giorno successivo" onClick={()=>setDate(shiftDate(date,1))}>→</button><button className="text-button" onClick={()=>setDate(localDate())}>Oggi</button></div></div>
      <div className="summary-grid diary-summary"><div><small>Calorie registrate</small><h2>{Math.round(totals.calories)} <small>/ {dayTarget} kcal</small></h2></div>{(['protein','carbs','fat'] as const).map((k,i) => <div key={k}><small>{['Proteine','Carboidrati','Grassi'][i]}</small><h3>{totals[k].toFixed(1)} g</h3>{today && <small>Riferimento: {macros[k]} g</small>}</div>)}</div><p className="chart-sync-note">I valori alimentari sono indicativi. Il target è una stima generale, modificabile tramite il profilo.</p></section>
      {!today && !future && !day && <section className="surface-card"><p>Nessuna giornata salvata per questa data. Lo storico si costruisce dai giorni di utilizzo dell’app.</p></section>}
      <section className="surface-card meal-card"><div className="card-head"><h3>{today ? 'Pasti previsti e consumati' : 'Pasti della giornata'}</h3><span className="soft-badge">{entries.filter(m=>m.checked).length} confermati</span></div>
      {today && yesterday.length > 0 && <button className="secondary-button" onClick={() => {
        const missing = yesterday.filter(item => !entries.some(entry => entry.name === item.name && entry.slot === item.slot));
        if (!missing.length) return toast.message("I pasti di ieri sono già nel diario.");
        saveEntries([...entries, ...copyMeals(missing)]);
      }}>Copia da ieri</button>}
      {[["Preferiti", favorites], ["Recenti", recents]] .map(([label, values]) => {
        const items = values as Meal[];
        return items.length ? <details key={String(label)} className="food-shortcuts"><summary>{String(label)}</summary>{items.map(item => <button key={item.id} className="secondary-button" onClick={() => saveEntries([...entries, ...copyMeals([item])])}>{item.name} · {item.grams ? item.grams + " g/ml" : item.slot}{item.detail ? " · " + item.detail : ""}</button>)}</details> : null;
      })}
      {entries.map(m => <div key={m.id} className={`meal-entry ${m.checked ? 'eaten' : ''}`}><button aria-label={`${m.checked ? 'Annulla registrazione' : 'Segna consumato'}: ${m.name}`} className={`check-circle ${m.checked ? 'done' : ''}`} disabled={future} onClick={() => saveEntries(entries.map(x=>x.id === m.id ? {...x,checked:!x.checked} : x))}>{m.checked && <Check size={15}/>}</button><div className="meal-entry-copy"><small>{m.slot} · {m.checked ? 'Consumato' : 'Previsto'}</small><strong>{m.name}</strong><span>{m.calories} kcal · P {m.protein.toFixed(1)} · C {m.carbs.toFixed(1)} · G {m.fat.toFixed(1)} g</span>{m.grams && <small>{m.grams} g / ml · {m.detail}</small>}{m.ingredients && <details><summary>Ingredienti e quantità</summary>{m.ingredients.map((ingredient,index) => { const f = FOODS.find(f=>f.id === ingredient.foodId); return <p key={index}>{f?.name}: {ingredient.grams} g · {f?.state}</p>; })}</details>}</div>{<div className="meal-entry-actions"><button className="text-button" onClick={()=>edit(m)}>Modifica</button><button className="text-button" aria-pressed={favorites.some(favorite => favorite.id === m.id)} onClick={() => setFavorites(favorites.some(favorite => favorite.id === m.id) ? favorites.filter(favorite => favorite.id !== m.id) : [...favorites, m])}>Preferito</button><button aria-label={`Elimina ${m.name}`} onClick={()=>saveEntries(entries.filter(x=>x.id!==m.id))}><Trash2 size={17}/></button></div>}</div>)}
      {entries.length === 0 && today && <p>Aggiungi un alimento o scegli una ricetta.</p>}</section>
    </TabsContent>
    <TabsContent value="recipes" className="tab-panel"><p>Ingredienti per una porzione. Puoi adattare ogni quantità prima di confermare il pasto.</p><div className="recipe-grid">{FOOD_RECIPES.filter(r => (dietLabel !== 'Vegetariana' || r.vegetarian) && r.ingredients.every(item => !excludedFoods.includes(item.foodId))).map(r => <article key={r.id} className="surface-card recipe-detail"><Utensils size={24}/><h3>{r.name}</h3><p>{r.minutes} min · {ingredientTotals(r.ingredients).calories} kcal</p>{r.ingredients.map(i => { const f = FOODS.find(f=>f.id === i.foodId)!; return <p key={i.foodId}><strong>{i.grams} g</strong> {f.name} <small>({f.state})</small></p>; })}<p>{r.instructions}</p><button className="primary-button" onClick={()=> { saveEntries([...entries, recipeMeal(r)]); toast.success('Ricetta aggiunta ai pasti previsti: conferma quando la consumi.'); }}>Aggiungi ai pasti previsti</button></article>)}</div></TabsContent>
    <TabsContent value="shopping" className="tab-panel"><section className="surface-card"><h3>Spesa dai tuoi ingredienti</h3><p>Somma gli ingredienti dei pasti inseriti nel diario nelle date che scegli.</p><div className="shopping-input"><label>Da<Input type="date" value={shopStart} onChange={event => setShopStart(event.target.value || localDate())} /></label><label>Giorni<Input type="number" min={1} max={14} value={shopDays} onChange={e=>setShopDays(Math.max(1,Math.min(14,Number(e.target.value)||1)))}/></label><button className="primary-button" onClick={()=>{ const selectedMeals = Array.from({length: shopDays}, (_, index) => shiftDate(shopStart, index)).flatMap(selectedDate =>
        selectedDate === localDate() ? meals : selectedDate > localDate() ? plans[selectedDate] ?? [] : history.find(item => item.date === selectedDate)?.meals ?? []);
        const list=shoppingFromMeals(selectedMeals); if (!list.length) return toast.message('Aggiungi prima pasti con ingredienti.'); setShopping([...list.map(i=>({...i,checked:shopping.find(s=>s.id===i.id)?.checked??false})),...shopping.filter(s=>!s.id.startsWith('food-'))]); toast.success('Lista aggiornata'); }}>Aggiorna lista</button></div><p className="chart-sync-note">Gli alimenti manuali e i prodotti da codice a barre vanno aggiunti alla lista a mano.</p><div className="shopping-input"><Input aria-label="Prodotto da acquistare" placeholder="Altro prodotto e quantità" value={newShop} onChange={e=>setNewShop(e.target.value)}/><button className="secondary-button" onClick={()=>{if(newShop.trim()){setShopping([...shopping,{id:crypto.randomUUID(),name:newShop.trim(),category:'Altro',checked:false}]);setNewShop('');}}}>Aggiungi</button></div>{shopping.map(i=><div className={`shopping-row ${i.checked?'checked':''}`} key={i.id}><button aria-label={`Segna acquistato: ${i.name}`} className="check-circle" onClick={()=>setShopping(shopping.map(s=>s.id===i.id?{...s,checked:!s.checked}:s))}>{i.checked&&<Check size={14}/>}</button><span><strong>{i.name}</strong><small>{i.category}</small></span><button aria-label={`Elimina ${i.name}`} onClick={()=>setShopping(shopping.filter(s=>s.id!==i.id))}><Trash2 size={17}/></button></div>)}</section></TabsContent>
    </Tabs>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>{editor?'Modifica pasto':'Aggiungi alimento'}</DialogTitle><DialogDescription>{editor?.ingredients?'Modifica i grammi dei singoli ingredienti.':'Usa i valori per 100 g / 100 ml e indica la quantità consumata.'}</DialogDescription></DialogHeader><div className="form-stack">
      {!editor && <><label>Alimenti comuni<select className="setup-select" value={foodId} onChange={e=>setFoodId(e.target.value)}>{FOODS.map(f=><option key={f.id} value={f.id}>{f.name} · {f.state}</option>)}</select></label><button className="secondary-button" onClick={chooseFood}>Usa questo alimento</button><div className="shopping-input"><Input aria-label="Codice a barre" placeholder="Codice a barre" value={barcode} onChange={e=>setBarcode(e.target.value)}/><button className="secondary-button" disabled={busy||!barcode} onClick={()=>void lookup()}>{busy?'Cerco…':'Cerca'}</button></div><label className="secondary-button"><Camera size={17}/> Foto come riferimento<input type="file" accept="image/*" capture="environment" hidden onChange={e=>{const f=e.target.files?.[0];if(f){if(f.size>8*1024*1024){toast.error('Scegli una foto inferiore a 8 MB');return;}const reader=new FileReader();reader.onload=()=>setPhoto(String(reader.result));reader.readAsDataURL(f);}}}/></label><small>La foto è solo un riferimento visivo: non vengono inventate calorie né analizzato il piatto.</small>{photo&&<img className="capture-preview" src={photo} alt="Riferimento del pasto"/>}</>}
      <label>Momento<select className="setup-select" value={draft.slot} onChange={e=>setDraft({...draft,slot:e.target.value})}>{SLOTS.map(s=><option key={s}>{s}</option>)}</select></label><label>Nome<Input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      {editor?.ingredients ? <>{editor.ingredients.map((ingredient,index)=><label key={index}>{FOODS.find(f=>f.id===ingredient.foodId)?.name} · {FOODS.find(f=>f.id===ingredient.foodId)?.state}<Input aria-label={`Grammi ingrediente ${index+1}`} type="number" min={1} max={3000} value={ingredient.grams} onChange={e=>{const grams=Number(e.target.value);if(Number.isFinite(grams)&&grams>=0&&grams<=3000)setEditor({...editor,ingredients:editor.ingredients!.map((i,j)=>j===index?{...i,grams}:i)});}}/></label>)}<p>Totale aggiornato: {ingredientTotals(editor.ingredients).calories} kcal</p></> : <><small>{draft.detail}</small>{(!editor||editor.per100)&&<label>Quantità consumata (g / ml)<Input type="number" min={1} max={10000} value={draft.grams} onChange={e=>setDraft({...draft,grams:e.target.value})}/></label>}<div className="form-grid">{(['calories','protein','carbs','fat'] as const).map((key,i)=><label key={key}>{['Calorie (kcal)','Proteine (g)','Carboidrati (g)','Grassi (g)'][i]}<Input type="number" min={0} step="0.1" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}</div>{(!editor||editor.per100)&&<p>Per la quantità indicata: <strong>{previewN.calories} kcal</strong> · P {previewN.protein} · C {previewN.carbs} · G {previewN.fat} g</p>}</>}
      <button className="primary-button full" onClick={save}>Salva {editor?'modifiche':'nel diario'}</button>
    </div></DialogContent></Dialog>
  </div>;
}
