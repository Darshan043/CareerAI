export function Field({ label, error, children }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-semibold text-coral">{error.message}</span> : null}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/15";
