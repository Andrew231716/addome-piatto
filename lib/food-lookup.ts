/** Free food lookups: Open Food Facts + optional BarcodeDetector (no API keys). */

export type FoodEstimate = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "openfoodfacts" | "heuristic" | "manual";
  detail?: string;
};

function num(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Open Food Facts product lookup (free, no key). */
export async function lookupBarcodeOpenFoodFacts(barcode: string): Promise<FoodEstimate | null> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 8) return null;
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      product_name_it?: string;
      brands?: string;
      nutriments?: Record<string, number | string | undefined>;
      serving_size?: string;
    };
  };
  if (data.status !== 1 || !data.product) return null;
  const n = data.product.nutriments ?? {};
  const name =
    data.product.product_name_it ||
    data.product.product_name ||
    data.product.brands ||
    `Prodotto ${code}`;
  // Prefer per-serving when present, else per 100g as a transparent estimate.
  const hasServing = n["energy-kcal_serving"] != null || n.energy_kcal_serving != null;
  const calories = Math.round(
    hasServing
      ? num(n["energy-kcal_serving"] ?? n.energy_kcal_serving)
      : num(n["energy-kcal_100g"] ?? n.energy_kcal_100g ?? n["energy-kcal"] ?? n.energy_kcal),
  );
  const protein = Math.round(
    hasServing ? num(n.proteins_serving) : num(n.proteins_100g ?? n.proteins),
  );
  const carbs = Math.round(
    hasServing ? num(n.carbohydrates_serving) : num(n.carbohydrates_100g ?? n.carbohydrates),
  );
  const fat = Math.round(hasServing ? num(n.fat_serving) : num(n.fat_100g ?? n.fat));
  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;
  return {
    name: name.slice(0, 80),
    calories: Math.max(0, calories),
    protein: Math.max(0, protein),
    carbs: Math.max(0, carbs),
    fat: Math.max(0, fat),
    source: "openfoodfacts",
    detail: hasServing
      ? `Porzione OFF${data.product.serving_size ? ` (${data.product.serving_size})` : ""}`
      : "Valori per 100 g (Open Food Facts)",
  };
}

/** Heuristic plate estimate from image size/type — always editable by the user. */
export async function heuristicFromPhoto(file: File): Promise<FoodEstimate> {
  const mb = file.size / (1024 * 1024);
  let calories = 420;
  if (mb > 2.5) calories = 620;
  else if (mb > 1.2) calories = 520;
  else if (mb < 0.35) calories = 280;
  const protein = Math.round(calories * 0.28 / 4);
  const fat = Math.round(calories * 0.3 / 9);
  const carbs = Math.max(20, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    name: `Piatto da foto · ${file.name.replace(/\.[^.]+$/, "").slice(0, 24) || "stima"}`,
    calories,
    protein,
    carbs,
    fat,
    source: "heuristic",
    detail: "Stima gratuita euristica — correggi prima di salvare",
  };
}

/** Try BarcodeDetector (Chromium); returns digits or null. */
export async function detectBarcodeFromImage(file: File): Promise<string | null> {
  const Detector = (window as unknown as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (source: ImageBitmap | HTMLCanvasElement | HTMLImageElement) => Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const detector = new Detector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
    });
    const bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    bitmap.close?.();
    const value = codes.find((item) => item.rawValue)?.rawValue;
    return value ? value.replace(/\s+/g, "") : null;
  } catch {
    return null;
  }
}
