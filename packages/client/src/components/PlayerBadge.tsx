import clsx from "clsx";
import type { PlayerSummary } from "@code-card/shared";

interface PlayerBadgeProps {
  player: PlayerSummary;
  isActive?: boolean;
}

export const PlayerBadge: React.FC<PlayerBadgeProps> = ({ player, isActive }) => {
  return (
    <div
      className={clsx(
        "flex w-full items-center justify-between rounded-xl border border-white/10 bg-gradient-to-r from-violet-500/10 via-sky-500/5 to-emerald-500/10 px-4 py-3 backdrop-blur",
        isActive &&
          "border-white/60 bg-gradient-to-r from-fuchsia-500/30 via-purple-500/20 to-emerald-400/30 text-white shadow-lg shadow-fuchsia-500/25"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-full bg-white/25 text-center text-lg font-semibold leading-9 text-slate-900">
          {player.name.charAt(0).toUpperCase()}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-white/80">{player.name}</span>
          <span className="text-xs text-white/60">
            {player.cardCount} card{player.cardCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/70">
        {player.isHost && <span className="rounded bg-white/20 px-2 py-1 text-slate-900">Host</span>}
        {player.hasCalledUno && (
          <span className="rounded bg-amber-400/90 px-2 py-1 text-amber-950 shadow shadow-amber-500/40">RUSH!</span>
        )}
      </div>
    </div>
  );
};
