"use client";

export function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-[var(--muted)]">—</span>;
  return (
    <span className={value > 0 ? "text-green-400" : "text-red-400"}>
      {value > 0 ? "+" : ""}{value.toLocaleString()}
    </span>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
