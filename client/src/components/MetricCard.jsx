import { Link } from "react-router-dom";
import { cx } from "../utils/format";

export function MetricCard({ label, value, tone = "moss", icon: Icon, to, onClick, hint }) {
  const tones = {
    moss: "bg-moss/10 text-moss",
    coral: "bg-coral/10 text-coral",
    gold: "bg-gold/10 text-gold",
    ink: "bg-ink/10 text-ink"
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/55">{label}</p>
          <p className="mt-2 text-3xl font-black text-ink">{value}</p>
          {hint ? <p className="mt-1 text-xs font-bold text-ink/40">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={`grid h-10 w-10 place-items-center rounded-md ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </>
  );

  const className = cx(
    "rounded-lg border border-ink/10 bg-white p-4 shadow-soft text-left transition",
    (to || onClick) && "hover:border-moss/40 focus:outline-none focus:ring-2 focus:ring-moss/30"
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={cx(className, "w-full")} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
