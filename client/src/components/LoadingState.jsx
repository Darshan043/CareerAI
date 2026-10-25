import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading" }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center gap-2 text-sm font-bold text-ink/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}
