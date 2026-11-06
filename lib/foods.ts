import type { Meal, ShoppingItem, DietStyle } from './plan';
export type Nutrients = { calories: number; protein: number; carbs: number; fat: number };
export type Food = Nutrients & { id: string; name: string; state: string; category: string };
export type Ingredient = { foodId: string; grams: number };
/** Generic approximate values per 100 g. Product labels take precedence. */
export const FOODS: Food[] = [
  { id: 'oats', name: 'Fiocchi di avena', state: 'secchi', category: 'Dispensa', calories: 370, protein: 13, carbs: 60, fat: 7 },
  { id: 'yogurt', name: 'Yogurt greco bianco 0%', state: 'come venduto', category: 'Frigo', calories: 59, protein: 10, carbs: 3.6, fat: 0.4 },
  { id: 'banana', name: 'Banana', state: 'parte edibile', category: 'Frutta e verdura', calories: 89, protein: 1.1, carbs: 20, fat: 0.3 },
  { id: 'apple', name: 'Mela', state: 'parte edibile', category: 'Frutta e verdura', calories: 52, protein: 0.3, carbs: 12, fat: 0.2 },
  { id: 'nuts', name: 'Noci', state: 'sgusciate', category: 'Dispensa', calories: 654, protein: 15, carbs: 7, fat: 65 },
  { id: 'rice', name: 'Riso basmati', state: 'crudo / secco', category: 'Dispensa', calories: 355, protein: 8, carbs: 78, fat: 1 },
  { id: 'rice-cooked', name: 'Riso bianco', state: 'cotto, senza condimenti', category: 'Preparati', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: 'pasta', name: 'Pasta integrale', state: 'cruda / secca', category: 'Dispensa', calories: 350, protein: 13, carbs: 65, fat: 2.5 },
  { id: 'bread', name: 'Pane integrale', state: 'come venduto', category: 'Dispensa', calories: 247, protein: 9, carbs: 41, fat: 4 },
  { id: 'chicken', name: 'Petto di pollo', state: 'crudo', category: 'Proteine', calories: 110, protein: 23, carbs: 0, fat: 1.5 },
  { id: 'salmon', name: 'Salmone', state: 'crudo', category: 'Proteine', calories: 208, protein: 20, carbs: 0, fat: 13 },
  { id: 'eggs', name: 'Uova', state: 'senza guscio', category: 'Proteine', calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
  { id: 'chickpeas', name: 'Ceci', state: 'cotti e scolati', category: 'Dispensa', calories: 120, protein: 7, carbs: 17, fat: 2 },
  { id: 'lentils', name: 'Lenticchie', state: 'cotte e scolate', category: 'Dispensa', calories: 116, protein: 9, carbs: 16, fat: 0.4 },
  { id: 'tofu', name: 'Tofu naturale', state: 'come venduto', category: 'Proteine', calories: 125, protein: 13, carbs: 1, fat: 7 },
  { id: 'soy', name: 'Yogurt di soia bianco', state: 'come venduto', category: 'Frigo', calories: 43, protein: 4, carbs: 2, fat: 2.3 },
  { id: 'ricotta', name: 'Ricotta vaccina', state: 'come venduta', category: 'Frigo', calories: 146, protein: 8.8, carbs: 3.5, fat: 10.9 },
  { id: 'potato', name: 'Patate', state: 'crude, sbucciate', category: 'Frutta e verdura', calories: 77, protein: 2, carbs: 17, fat: 0.1 },
  { id: 'veg', name: 'Verdure miste', state: 'crude, parte edibile', category: 'Frutta e verdura', calories: 30, protein: 1.5, carbs: 4, fat: 0.3 },
  { id: 'oil', name: 'Olio extravergine di oliva', state: 'come venduto', category: 'Dispensa', calories: 900, protein: 0, carbs: 0, fat: 100 },
];
export function nutrientsFor(food: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  return { calories: Math.round(food.calories * factor), protein: Math.round(food.protein * factor * 10) / 10, carbs: Math.round(food.carbs * factor * 10) / 10, fat: Math.round(food.fat * factor * 10) / 10 };
}
export function ingredientTotals(ingredients: Ingredient[]): Nutrients {
  return ingredients.reduce((sum, ingredient) => {
    const food = FOODS.find(f => f.id === ingredient.foodId);
    if (!food) return sum;
    const n = nutrientsFor(food, ingredient.grams);
    return { calories: sum.calories + n.calories, protein: +(sum.protein + n.protein).toFixed(1), carbs: +(sum.carbs + n.carbs).toFixed(1), fat: +(sum.fat + n.fat).toFixed(1) };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}
export type FoodRecipe = { id: string; name: string; slot: string; minutes: number; vegetarian: boolean; ingredients: Ingredient[]; instructions: string };
const parts = (...items: [string, number][]): Ingredient[] => items.map(([foodId, grams]) => ({ foodId, grams }));
export const FOOD_RECIPES: FoodRecipe[] = [
  { id: 'breakfast', name: 'Yogurt, avena e banana', slot: 'Colazione', minutes: 5, vegetarian: true, ingredients: parts(['yogurt', 170], ['oats', 50], ['banana', 100]), instructions: 'Mescola yogurt e avena, aggiungi la banana a pezzi.' },
  { id: 'snack', name: 'Mela e noci', slot: 'Spuntino', minutes: 2, vegetarian: true, ingredients: parts(['apple', 150], ['nuts', 20]), instructions: 'Lava la mela e accompagna con le noci sgusciate.' },
  { id: 'chicken-bowl', name: 'Pollo, riso e verdure', slot: 'Pranzo', minutes: 25, vegetarian: false, ingredients: parts(['chicken', 150], ['rice', 80], ['veg', 200], ['oil', 10]), instructions: 'Pesa riso e pollo crudi. Cuoci riso e pollo separatamente, aggiungi le verdure e l’olio dosato.' },
  { id: 'chickpea-pasta', name: 'Pasta integrale con ceci e verdure', slot: 'Pranzo', minutes: 20, vegetarian: true, ingredients: parts(['pasta', 80], ['chickpeas', 120], ['veg', 200], ['oil', 10]), instructions: 'Pesa la pasta secca e i ceci scolati. Cuoci la pasta, unisci ceci e verdure cotte, condisci con l’olio dosato.' },
  { id: 'merenda', name: 'Pane integrale e ricotta', slot: 'Merenda', minutes: 3, vegetarian: true, ingredients: parts(['bread', 50], ['ricotta', 70]), instructions: 'Spalma la ricotta sul pane. Controlla l’etichetta dei prodotti utilizzati.' },
  { id: 'fish', name: 'Salmone, patate e verdure', slot: 'Cena', minutes: 30, vegetarian: false, ingredients: parts(['salmon', 150], ['potato', 200], ['veg', 200], ['oil', 5]), instructions: 'Pesa pesce e patate crudi. Cuoci al forno o al vapore e aggiungi le verdure e l’olio dosato.' },
  { id: 'tofu-rice', name: 'Tofu, riso e verdure', slot: 'Cena', minutes: 20, vegetarian: true, ingredients: parts(['tofu', 180], ['rice', 70], ['veg', 200], ['oil', 10]), instructions: 'Cuoci il riso pesato secco. Salta il tofu con le verdure, usando l’olio indicato.' },
];
export function recipeMeal(recipe: FoodRecipe, factor = 1): Meal {
  const ingredients = recipe.ingredients.map(i => ({ ...i, grams: Math.round(i.grams * factor) }));
  return { id: crypto.randomUUID(), slot: recipe.slot, name: recipe.name, ...ingredientTotals(ingredients), checked: false, ingredients, recipeId: recipe.id, source: 'recipe' };
}
export function plannedMeals(diet: DietStyle, calories: number): Meal[] {
  const ids = ['breakfast', 'snack', diet === 'vegetarian' || diet === 'mediterranean' ? 'chickpea-pasta' : 'chicken-bowl', 'merenda', diet === 'vegetarian' ? 'tofu-rice' : 'fish'];
  const recipes = ids.map(id => FOOD_RECIPES.find(r => r.id === id)!);
  const base = recipes.reduce((sum, r) => sum + ingredientTotals(r.ingredients).calories, 0);
  return recipes.map(r => recipeMeal(r, calories / base));
}
export function shoppingFromMeals(meals: Meal[], days = 1): ShoppingItem[] {
  const totals = new Map<string, number>();
  for (const meal of meals) for (const i of meal.ingredients ?? []) totals.set(i.foodId, (totals.get(i.foodId) ?? 0) + i.grams * days);
  return [...totals].map(([id, grams]) => {
    const f = FOODS.find(f => f.id === id)!;
    return { id: `food-${id}`, name: `${f.name} · ${Math.round(grams)} g (${f.state})`, category: f.category, checked: false };
  });
}
