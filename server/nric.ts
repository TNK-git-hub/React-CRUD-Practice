// Singapore NRIC / FIN validation (D-12) and comparison (D-21).

const WEIGHTS = [2, 7, 6, 5, 4, 3, 2] as const;
const TABLE_ST = "JZIHGFEDCBA";
const TABLE_FG = "XWUTRQPNMLK";
const TABLE_M = "XWUTRQPNJLK";
const OFFSET: Record<string, number> = { S: 0, T: 4, F: 0, G: 4, M: 3 };

export function normalizeNric(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidNric(value: string): boolean {
  const v = normalizeNric(value);
  const m = /^([STFGM])(\d{7})([A-Z])$/.exec(v);
  if (!m) return false;
  const [, prefix = "", digits = "", check = ""] = m;
  let sum = OFFSET[prefix] ?? 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * (WEIGHTS[i] ?? 0);
  const table = prefix === "S" || prefix === "T" ? TABLE_ST : prefix === "M" ? TABLE_M : TABLE_FG;
  return table[sum % 11] === check;
}

export function nricMatches(a: string, b: string): boolean {
  return normalizeNric(a) === normalizeNric(b);
}

export function maskNric(value: string): string {
  const v = normalizeNric(value);
  return v.length === 9 ? `${v[0]}****${v.slice(5)}` : v;
}

// D-13: exactly 8 digits, starting with 8 or 9 (spaces allowed while typing)
export function isValidMobile(value: string): boolean {
  return /^[89]\d{7}$/.test(value.replace(/\s+/g, ""));
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
