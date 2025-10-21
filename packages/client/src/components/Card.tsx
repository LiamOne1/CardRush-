import clsx from "clsx";
import type { Card } from "@code-card/shared";

const colorClassMap: Record<Card["color"], string> = {
  red: "bg-gradient-to-br from-uno-red to-red-700",
  yellow: "bg-gradient-to-br from-uno-yellow to-amber-500",
  green: "bg-gradient-to-br from-uno-green to-emerald-600",
  blue: "bg-gradient-to-br from-uno-blue to-blue-700",
  wild: "bg-gradient-to-br from-slate-800 to-slate-900"
};

const valueLabelMap: Partial<Record<Card["value"], string>> = {
  skip: "?",
  reverse: "??",
  draw2: "+2",
  wild: "?",
  wild4: "+4"
};

interface CardProps {
  card: Card;
  disabled?: boolean;
  onSelect?: (card: Card) => void;
}

export const UnoCard: React.FC<CardProps> = ({ card, disabled, onSelect }) => {
  const label = valueLabelMap[card.value] ?? card.value.toUpperCase();

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect?.(card)}
      className={clsx(
        "relative h-36 w-24 flex-shrink-0 rounded-xl border-4 border-white/40 p-3 text-center shadow-lg transition",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer hover:-translate-y-1 hover:shadow-xl",
        colorClassMap[card.color]
      )}
    >
      <span className="absolute left-2 top-2 text-sm font-bold text-white/80">{card.value}</span>
      <span className="flex h-full items-center justify-center text-4xl font-bold text-white drop-shadow" aria-label={card.value}>
        {label}
      </span>
      <span className="absolute bottom-2 right-2 text-sm font-bold text-white/80">{card.color === "wild" ? "?" : card.color}</span>
    </button>
  );
};
