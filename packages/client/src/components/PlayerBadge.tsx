import clsx from "clsx";
import type { PlayerSummary } from "@codex-card/shared";

interface PlayerBadgeProps {
  player: PlayerSummary;
  isActive?: boolean;
}

export const PlayerBadge: React.FC<PlayerBadgeProps> = ({ player, isActive }) => {
  return (
    <div
      className={clsx(
        "flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3",
        isActive && "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="h-8 w-8 rounded-full bg-white/20 text-center text-lg font-semibold leading-8 text-white">
          {player.name.charAt(0).toUpperCase()}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-white/70">
            {player.name}
          </span>
          <span className="text-xs text-white/50">
            {player.cardCount} card{player.cardCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
        {player.isHost && <span className="rounded bg-white/10 px-2 py-1">Host</span>}
        {player.hasCalledUno && <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-200">RUSH!</span>}
      </div>
    </div>
  );
};
