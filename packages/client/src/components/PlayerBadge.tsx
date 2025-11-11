import clsx from "clsx";
import type { PlayerSummary, EmoteType } from "@code-card/shared";
import { EMOTE_BY_TYPE, EMOTE_OPTIONS } from "../constants/emotes";

interface PlayerBadgeProps {
  player: PlayerSummary;
  isActive?: boolean;
  isCurrentTurn?: boolean;
  turnSecondsLeft?: number | null;
  emote?: EmoteType | null;
  showEmotePicker?: boolean;
  isEmoteMenuOpen?: boolean;
  onEmoteTrigger?: () => void;
  onEmoteSelect?: (emote: EmoteType) => void;
}

export const PlayerBadge: React.FC<PlayerBadgeProps> = ({
  player,
  isActive,
  isCurrentTurn,
  turnSecondsLeft,
  emote,
  showEmotePicker,
  isEmoteMenuOpen,
  onEmoteTrigger,
  onEmoteSelect
}) => {
  const isFrozen = player.frozenForTurns > 0;
  const emoteDefinition = emote ? EMOTE_BY_TYPE[emote] : null;

  return (
    <div
      className={clsx(
        "relative flex w-full items-center justify-between rounded-xl border border-white/10 bg-gradient-to-r from-violet-500/10 via-sky-500/5 to-emerald-500/10 px-4 py-3 backdrop-blur",
        isActive &&
          "border-white/60 bg-gradient-to-r from-fuchsia-500/30 via-purple-500/20 to-emerald-400/30 text-white shadow-lg shadow-fuchsia-500/25",
        isFrozen && "border-cyan-300/60"
      )}
    >
      {emoteDefinition && (
        <div className="absolute -top-4 left-1/2 flex min-w-[48px] -translate-x-1/2 items-center justify-center rounded-full border border-white/40 bg-white/90 px-3 py-1 text-lg leading-none text-slate-900 shadow-lg shadow-black/20">
          <span aria-hidden="true">
            {emoteDefinition.emoji}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-full bg-white/25 text-center text-lg font-semibold leading-9 text-slate-900">
          {player.name.charAt(0).toUpperCase()}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-white/80">{player.name}</span>
          <span className="text-xs text-white/60">
            {player.cardCount} card{player.cardCount === 1 ? "" : "s"}
          </span>
          {isCurrentTurn && turnSecondsLeft !== null && (
            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200">
              <span aria-hidden="true">⏱</span>
              <span>{Math.max(0, turnSecondsLeft)}s</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs uppercase tracking-wide text-white/70">
        {showEmotePicker && (
          <div className="relative z-40">
            <button
              type="button"
              onClick={onEmoteTrigger}
            className={clsx(
              "flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-lg text-white transition",
              "hover:border-white/40 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            )}
            aria-label={isEmoteMenuOpen ? "Close emote menu" : "Open emote menu"}
          >
            <span aria-hidden="true" className="relative flex h-6 items-center justify-center">
              <span className="flex h-full items-center rounded-full bg-white px-2 text-[10px] font-bold leading-none text-slate-900">
                ...
              </span>
              <span className="absolute -bottom-[3px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white transform" />
            </span>
          </button>
            {isEmoteMenuOpen && (
              <div className="absolute right-1/2 top-0 z-50 flex translate-x-1/2 -translate-y-full gap-2 rounded-2xl border border-white/20 bg-slate-900/95 p-2 shadow-lg backdrop-blur">
                {EMOTE_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => onEmoteSelect?.(option.type)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <span aria-hidden="true">{option.emoji}</span>
                    <span className="sr-only">{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {player.isHost && <span className="rounded bg-white/20 px-2 py-1 text-slate-900">Host</span>}
        {player.hasCalledUno && (
          <span className="rounded bg-amber-400/90 px-2 py-1 text-amber-950 shadow shadow-amber-500/40">RUSH!</span>
        )}
        {player.powerCardCount > 0 && (
          <span className="rounded bg-sky-500/20 px-2 py-1 text-sky-200">
            ⚡ {player.powerCardCount}
          </span>
        )}
        {player.powerPoints > 0 && (
          <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-200">
            {player.powerPoints} pts
          </span>
        )}
        {player.frozenForTurns > 0 && (
          <span className="rounded bg-cyan-500/20 px-2 py-1 text-cyan-100">
            Frozen {player.frozenForTurns}
          </span>
        )}
      </div>
    </div>
  );
};
