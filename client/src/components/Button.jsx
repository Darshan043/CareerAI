import { Loader2 } from "lucide-react";
import { cx } from "../utils/format";

const variants = {
  primary: "bg-ink text-white hover:bg-black",
  secondary: "bg-white text-ink border border-ink/10 hover:border-moss/50",
  danger: "bg-coral text-white hover:bg-[#bd4c38]",
  ghost: "text-ink hover:bg-ink/5"
};

export function Button({ children, icon: Icon, loading, variant = "primary", className = "", ...props }) {
  return (
    <button
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
