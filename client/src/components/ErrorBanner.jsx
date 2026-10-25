export function ErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
      {error.response?.data?.message || error.message || "Something went wrong."}
    </div>
  );
}
