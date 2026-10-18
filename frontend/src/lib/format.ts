import dayjs from "dayjs";

export function formatRON(n: number): string {
  const v = Math.round(n);
  return `${v.toLocaleString("ro-RO")} RON`;
}

export function formatRON2(n: number): string {
  return `${(n ?? 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return dayjs(iso).format("DD.MM.YYYY");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
