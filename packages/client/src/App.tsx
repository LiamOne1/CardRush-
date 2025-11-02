import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  Card,
  LobbyState,
  PlayerSummary,
  PublicGameState,
  PowerCard,
  PowerStatePayload,
  RushAlertPayload,
  EmotePayload,
  EmoteType
} from "@code-card/shared";
import { CARD_COLORS } from "@code-card/shared";
import { UnoCard } from "./components/Card";
import { PlayerBadge } from "./components/PlayerBadge";
import { useAuth, type AuthUser } from "./providers/auth-provider";
import { useSocket } from "./providers/socket-provider";
import { EMOTE_OPTIONS, EMOTE_DISPLAY_DURATION_MS } from "./constants/emotes";

interface GameEndedData {
  winnerId: string;
  scores: Record<string, number>;
}

const initialHandState: Card[] = [];
const initialPowerState: PowerStatePayload = {
  points: 0,
  cards: [],
  requiredDraws: 0
};

const usePhasedState = () => {
  const [phase, setPhase] = useState<"landing" | "lobby" | "game" | "ended">("landing");
  return { phase, setPhase } as const;
};

const isWildCard = (card: Card) => card.value === "wild" || card.value === "wild4";

const formatScoreboard = (players: PlayerSummary[], scores: Record<string, number>) => {
  return players
    .map((player) => ({
      player,
      score: scores[player.id] ?? 0
    }))
    .sort((a, b) => b.score - a.score);
};

const POWER_CARD_INFO: Record<PowerCard["type"], { label: string; description: string }> = {
  cardRush: {
    label: "Card Rush",
    description: "All opponents draw two cards."
  },
  freeze: {
    label: "Freeze",
    description: "Skip a player's next two turns."
  },
  colorRush: {
    label: "Color Rush",
    description: "Shuffle every card of one color from your hand back into the deck."
  },
  swapHands: {
    label: "Swap Hands",
    description: "Trade your hand with any player you choose."
  }
};

const PowerCardToken: React.FC<{
  info: { label: string; description: string };
  card: PowerCard;
  disabled: boolean;
  onSelect: (card: PowerCard) => void;
}> = ({ info, card, disabled, onSelect }) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(card)}
      disabled={disabled}
      className={`relative flex h-36 w-24 flex-shrink-0 flex-col justify-between rounded-2xl border border-emerald-200/40 bg-gradient-to-br from-emerald-500/25 via-cyan-500/15 to-sky-500/30 p-4 text-left shadow-lg shadow-emerald-500/25 transition ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer hover:-translate-y-1 hover:border-emerald-200/70 hover:shadow-emerald-400/40"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent_65%)]" />
      <span className="relative text-xs font-semibold uppercase tracking-[0.35em] text-emerald-100">
        {info.label}
      </span>
      <span className="relative text-[10px] leading-4 text-white/75">{info.description}</span>
      <span className="relative self-end text-[10px] uppercase tracking-[0.4em] text-emerald-200">Play</span>
    </button>
  );
};

interface AccountPanelProps {
  user: AuthUser | null;
  initializing: boolean;
  onLogin: (payload: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
  onRegister: (payload: { email: string; password: string; displayName: string }) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => void;
  showExpanded: boolean;
}

const AccountPanel: React.FC<AccountPanelProps> = ({ user, initializing, onLogin, onRegister, onLogout, showExpanded }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(showExpanded);
  const previousShowExpanded = useRef(showExpanded);

  useEffect(() => {
    if (user) {
      setExpanded(false);
    }
  }, [user]);

  useEffect(() => {
    if (showExpanded && !previousShowExpanded.current && !user) {
      setExpanded(true);
    }
    previousShowExpanded.current = showExpanded;
  }, [showExpanded, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setStatus("Email and password are required.");
      setSubmitting(false);
      return;
    }

    if (mode === "register" && displayName.trim().length < 2) {
      setStatus("Display name must be at least 2 characters.");
      setSubmitting(false);
      return;
    }

    const result =
      mode === "login"
        ? await onLogin({ email: trimmedEmail, password: trimmedPassword })
        : await onRegister({ email: trimmedEmail, password: trimmedPassword, displayName: displayName.trim() });

    if (!result.success) {
      setStatus(result.error ?? "Unable to complete request.");
    } else {
      setEmail("");
      setPassword("");
      setDisplayName("");
      setStatus(null);
      if (!showExpanded) {
        setExpanded(false);
      }
    }

    setSubmitting(false);
  };

  if (initializing) {
    return (
      <section className="mb-6 rounded-3xl border border-white/10 bg-slate-900/40 p-6 text-white backdrop-blur">
        <p className="text-xs uppercase tracking-[0.35em] text-white/60">Loading account...</p>
      </section>
    );
  }

  if (user) {
    return (
      <section className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/40 p-6 text-white backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/50">Signed in as</p>
            <p className="text-lg font-semibold uppercase tracking-[0.3em] text-white">{user.displayName}</p>
            <p className="text-xs text-white/50">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-4 text-xs uppercase tracking-[0.3em] text-white/70">
              <span>Wins {user.stats.wins}</span>
              <span>Losses {user.stats.losses}</span>
              <span>Games {user.stats.gamesPlayed}</span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
            >
              Log out
            </button>
          </div>
        </div>
        <p className="text-xs text-white/60">
          Keep playing to level up your record. Your wins and losses update automatically after each game.
        </p>
      </section>
    );
  }

  if (!expanded) {
    return (
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            setStatus(null);
          }}
          className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
        >
          Sign in to track wins
        </button>
      </div>
    );
  }

  return (
    <section className="mb-6 rounded-3xl border border-white/10 bg-slate-900/40 p-6 text-white backdrop-blur">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold uppercase tracking-[0.3em]">Account</h2>
          <p className="text-xs text-white/60">
            Create a free account to save your wins and losses across sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setStatus(null);
          }}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
        >
          Close
        </button>
      </div>
      <div className="mb-4 flex gap-3">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setStatus(null);
          }}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] transition ${
            mode === "login"
              ? "bg-emerald-400 text-emerald-950 shadow shadow-emerald-400/40"
              : "border border-white/20 text-white hover:bg-white/10"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setStatus(null);
          }}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] transition ${
            mode === "register"
              ? "bg-sky-400 text-sky-950 shadow shadow-sky-400/40"
              : "border border-white/20 text-white hover:bg-white/10"
          }`}
        >
          Register
        </button>
      </div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="text-xs uppercase tracking-[0.3em] text-white/60">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="text-xs uppercase tracking-[0.3em] text-white/60">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
            placeholder="Minimum 6 characters"
            required
          />
        </label>
        {mode === "register" && (
          <label className="text-xs uppercase tracking-[0.3em] text-white/60 sm:col-span-2">
            Display Name
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              placeholder="How friends see you"
              required
              minLength={2}
              maxLength={50}
            />
          </label>
        )}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-slate-900 shadow shadow-emerald-400/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </div>
      </form>
      {status && <p className="mt-3 text-xs text-rose-300">{status}</p>}
      <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-white/50">
        Your credentials are encrypted, and your game history updates after each match. You can keep playing as a guest
        anytime.
      </p>
    </section>
  );
};

const GameBoard: React.FC<{
  gameState: PublicGameState;
  hand: Card[];
  canPlayBase: boolean;
  canDrawBase: boolean;
  onPlay: (card: Card, color?: typeof CARD_COLORS[number]) => void;
  onDraw: () => void;
  isResolvingWild: boolean;
  onResolveWild: (color: typeof CARD_COLORS[number]) => void;
  powerState: PowerStatePayload;
  onPowerCardSelect: (card: PowerCard) => void;
  onPowerCardDraw: () => void;
  mustDrawPower: boolean;
  localPlayerId: string | null;
  activeEmotes: Partial<Record<string, EmoteType>>;
  onSendEmote: (emote: EmoteType) => void;
}> = ({
  gameState,
  hand,
  canPlayBase,
  canDrawBase,
  onPlay,
  onDraw,
  isResolvingWild,
  onResolveWild,
  powerState,
  onPowerCardSelect,
  onPowerCardDraw,
  mustDrawPower,
  localPlayerId,
  activeEmotes,
  onSendEmote
}) => {
  const {
    discardTop,
    currentPlayerId,
    currentColor,
    players,
    drawStack,
    pendingPowerDrawPlayerId
  } = gameState;

  const awaitingPlayer = pendingPowerDrawPlayerId
    ? players.find((player) => player.id === pendingPowerDrawPlayerId)
    : null;
  const POWER_CARD_COST = 4;
  const remainder = powerState.points % POWER_CARD_COST;
  const readyPowerDraws = Math.floor(powerState.points / POWER_CARD_COST);
  const pointsUntilNext =
    readyPowerDraws > 0 ? 0 : POWER_CARD_COST - (remainder === 0 ? powerState.points : remainder);
  const baseProgress = readyPowerDraws > 0 ? 1 : remainder / POWER_CARD_COST;
  const progress = mustDrawPower ? 1 : baseProgress;
  const progressPercentage = Math.min(1, progress) * 100;
  const isMeterCharged = progress >= 1;
  const progressPointsDisplay =
    readyPowerDraws > 0 || mustDrawPower ? POWER_CARD_COST : remainder;
  const drawCountDisplay =
    powerState.requiredDraws > 0 ? powerState.requiredDraws : readyPowerDraws;
  const powerStatusLabel = mustDrawPower
    ? powerState.requiredDraws > 1
      ? `Draw ${powerState.requiredDraws} power cards`
      : "Draw a power card to continue"
    : readyPowerDraws > 0
    ? `${readyPowerDraws} power card${readyPowerDraws > 1 ? "s" : ""} ready`
    : `${pointsUntilNext} pts to unlock`;
  const canPlayPowerCard = canPlayBase && !mustDrawPower;

  return (
    <div className="flex h-full flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 rounded-3xl border border-white/10 bg-slate-900/30 p-4 backdrop-blur sm:grid-cols-2">
        {players.map((player) => (
          <PlayerBadge key={player.id} player={player} isActive={player.id === currentPlayerId} emote={activeEmotes[player.id]} />
        ))}
      </section>
      {localPlayerId && (
        <section className="flex flex-wrap items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-900/35 px-5 py-4 text-white backdrop-blur">
          <span className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Quick Emotes</span>
          <div className="flex flex-wrap justify-center gap-2">
            {EMOTE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                onClick={() => onSendEmote(option.type)}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/35 hover:bg-white/20"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {option.emoji}
                </span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-[2.25rem] border border-white/15 bg-gradient-to-br from-cyan-500/20 via-indigo-500/15 to-fuchsia-500/20 p-6 text-white shadow-[0_0_45px_rgba(96,165,250,0.25)] backdrop-blur-lg">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs uppercase tracking-[0.5em] text-white/60">Discard</p>
          <UnoCard card={discardTop} disabled onSelect={() => undefined} />
          <p className="text-sm uppercase tracking-[0.4em] text-white/80">Color: {currentColor.toUpperCase()}</p>
          {drawStack > 0 && (
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-amber-200">Draw stack +{drawStack}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDraw}
            disabled={!canDrawBase}
            className="rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 px-8 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-slate-900 shadow-lg shadow-rose-500/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Draw Card
          </button>
        </div>
      </section>

      <section
        className={`rounded-3xl border border-white/10 bg-slate-900/40 px-5 py-4 text-white backdrop-blur ${
          isMeterCharged ? "border-emerald-300/60 shadow-[0_0_25px_rgba(16,185,129,0.35)]" : ""
        }`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl uppercase tracking-[0.4em]">Power Meter</h2>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                {powerState.points} pts total
              </p>
            </div>
            <button
              type="button"
              onClick={onPowerCardDraw}
              disabled={!mustDrawPower}
              className="rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 px-5 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-slate-900 transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
            >
              Draw Power Card
              {drawCountDisplay > 1 ? ` (${drawCountDisplay}x)` : ""}
            </button>
          </div>

          {awaitingPlayer && (
            <p className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">
              {awaitingPlayer.id === localPlayerId
                ? `Draw ${powerState.requiredDraws} Power Card${powerState.requiredDraws > 1 ? "s" : ""} to continue`
                : `Waiting for ${awaitingPlayer.name} to draw a Power Card`}
            </p>
          )}

          <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-500 transition-all duration-500 ${
                mustDrawPower ? "animate-pulse" : ""
              }`}
              style={{
                width: `${progressPercentage}%`,
                boxShadow:
                  progressPercentage > 0
                    ? `0 0 ${isMeterCharged ? 28 : 16}px rgba(16, 185, 129, ${isMeterCharged ? 0.45 : 0.25})`
                    : "none"
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-white/60">
            <span>{powerStatusLabel}</span>
            <span>
              {progressPointsDisplay}/{POWER_CARD_COST} pts
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl uppercase tracking-[0.4em] text-white">Your Hand</h2>
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">
            {mustDrawPower
              ? "Draw a Power Card to continue"
              : canPlayBase
              ? "Your turn"
              : "Waiting for opponents"}
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          {powerState.cards.map((card) => (
            <PowerCardToken
              key={card.id}
              card={card}
              info={POWER_CARD_INFO[card.type]}
              disabled={!canPlayPowerCard}
              onSelect={onPowerCardSelect}
            />
          ))}
          {hand.map((card) => (
            <UnoCard
              key={card.id}
              card={card}
              disabled={!canPlayBase}
              onSelect={(selected) => {
                if (!canPlayBase) return;
                if (isWildCard(selected)) {
                  onPlay(selected);
                } else {
                  onPlay(selected);
                }
              }}
            />
          ))}
          {hand.length === 0 && powerState.cards.length === 0 && (
            <p className="text-sm text-white/60">No cards in hand.</p>
          )}
        </div>
      </section>

      {isResolvingWild && (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-80 rounded-3xl bg-slate-900 p-6 text-center shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold uppercase tracking-widest text-white/80">
              Choose a Color
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {CARD_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="rounded-xl px-4 py-3 text-sm font-semibold uppercase tracking-widest text-slate-950"
                  style={{
                    backgroundColor:
                      color === "yellow"
                        ? "#ffd93d"
                        : color === "blue"
                        ? "#2196f3"
                        : color === "red"
                        ? "#ff4d4d"
                        : "#4caf50"
                  }}
                  onClick={() => onResolveWild(color)}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
const LobbyPanel: React.FC<{
  lobby: LobbyState;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
}> = ({ lobby, isHost, onStart, onLeave }) => {
  const canStart = isHost && lobby.players.length >= 2 && lobby.players.length <= 4;
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-inner">
        <p className="text-sm uppercase tracking-[0.4em] text-white/40">Room Code</p>
        <p className="font-display text-5xl tracking-widest text-white">{lobby.roomCode}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-white/50">Share this code with friends</p>
      </div>
      <div className="space-y-3">
        {lobby.players.map((player) => (
          <PlayerBadge key={player.id} player={player} />
        ))}
      </div>
      <div className="flex items-center gap-4">
        {isHost ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-emerald-950 transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
          >
            Start Game
          </button>
        ) : (
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">Waiting for host to start...</p>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-white/10"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
};

const LandingPanel: React.FC<{
  name: string;
  setName: (value: string) => void;
  room: string;
  setRoom: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  error?: string;
  accountUser?: AuthUser | null;
}> = ({ name, setName, room, setRoom, onCreate, onJoin, error, accountUser }) => {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-white shadow-2xl">
      <header className="text-center">
        <h1 className="font-display text-4xl uppercase tracking-[0.4em] text-white">Card Rush!</h1>
        <p className="mt-4 text-sm text-white/60">
          Create a lobby or join with a room code. Plays best with 2-4 friends.
        </p>
      </header>

      {accountUser && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-left text-white/80">
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">Welcome back</p>
          <p className="mt-1 text-lg font-semibold uppercase tracking-[0.3em] text-white">{accountUser.displayName}</p>
          <div className="mt-3 flex gap-4 text-xs uppercase tracking-[0.35em] text-white/60">
            <span>Wins {accountUser.stats.wins}</span>
            <span>Losses {accountUser.stats.losses}</span>
            <span>Games {accountUser.stats.gamesPlayed}</span>
          </div>
        </div>
      )}

      <label className="text-sm font-semibold uppercase tracking-widest text-white/60" htmlFor="name">
        Display Name
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Liam"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:border-emerald-400 focus:outline-none"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCreate}
          className="rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-semibold uppercase tracking-widest text-emerald-950 transition hover:bg-emerald-400"
        >
          Create Lobby
        </button>
        <div className="flex flex-col gap-3">
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value.toUpperCase())}
            placeholder="Room Code"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-lg font-semibold tracking-[0.4em] text-white focus:border-emerald-400 focus:outline-none"
            maxLength={6}
          />
          <button
            type="button"
            onClick={onJoin}
            className="rounded-2xl border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-white/10"
          >
            Join Lobby
          </button>
        </div>
      </div>
      {error && <p className="text-center text-sm text-red-300">{error}</p>}
    </div>
  );
};

const GameOverPanel: React.FC<{
  data: GameEndedData;
  players: PlayerSummary[];
  onPlayAgain: () => void;
}> = ({ data, players, onPlayAgain }) => {
  const scoreRows = formatScoreboard(players, data.scores);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-white shadow-xl">
      <header className="text-center">
        <h2 className="font-display text-3xl uppercase tracking-[0.3em] text-white">Game Over</h2>
        <p className="mt-2 text-xs uppercase tracking-widest text-white/60">
          Winner: {players.find((p) => p.id === data.winnerId)?.name ?? "Unknown"}
        </p>
      </header>
      <ul className="space-y-3">
        {scoreRows.map(({ player }) => {
          const isWinner = player.id === data.winnerId;
          return (
            <li key={player.id} className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3 text-sm">
              <span className="font-semibold uppercase tracking-widest text-white/70">{player.name}</span>
              <span
                className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] ${isWinner ? "text-amber-300" : "text-rose-300"}`}
                role="status"
                aria-label={isWinner ? "Winner" : "Defeated"}
              >
                <span aria-hidden="true" className="text-xl">{isWinner ? "\u2605" : "\u2715"}</span>
                {isWinner ? "Winner" : "Eliminated"}
              </span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onPlayAgain}
        className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-emerald-950 transition hover:bg-emerald-400"
      >
        Back to Lobby
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const socket = useSocket();
  const { phase, setPhase } = usePhasedState();
  const { user: authUser, initializing: authInitializing, login, register, logout, refreshProfile } = useAuth();

  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [hand, setHand] = useState<Card[]>(initialHandState);
  const [powerState, setPowerState] = useState<PowerStatePayload>(initialPowerState);
  const [pendingPowerAction, setPendingPowerAction] = useState<{ card: PowerCard; mode: "target" | "color" } | null>(null);
  const [pendingWild, setPendingWild] = useState<Card | null>(null);
  const [lastError, setLastError] = useState<string | undefined>();
  const [endState, setEndState] = useState<GameEndedData | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [rushNotice, setRushNotice] = useState<string | null>(null);
  const [activeEmotes, setActiveEmotes] = useState<Record<string, EmoteType>>({});
  const rushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emoteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const showEmote = useCallback(
    (targetPlayerId: string, emote: EmoteType) => {
      setActiveEmotes((prev) => ({
        ...prev,
        [targetPlayerId]: emote
      }));

      if (emoteTimers.current[targetPlayerId]) {
        clearTimeout(emoteTimers.current[targetPlayerId]);
      }

      emoteTimers.current[targetPlayerId] = setTimeout(() => {
        setActiveEmotes((prev) => {
          const next = { ...prev };
          delete next[targetPlayerId];
          return next;
        });
        delete emoteTimers.current[targetPlayerId];
      }, EMOTE_DISPLAY_DURATION_MS);
    },
    []
  );

  useEffect(() => {
    if (authUser && !name) {
      setName(authUser.displayName);
    }
  }, [authUser, name]);

  useEffect(() => {
    return () => {
      Object.values(emoteTimers.current).forEach((timer) => {
        clearTimeout(timer);
      });
      emoteTimers.current = {};
    };
  }, []);

  useEffect(() => {
    const handleConnect = () => {
      setPlayerId(socket.id ?? null);
    };
    const handleLobbyUpdate = (state: LobbyState) => {
      setLobbyState(state);
      setRoomCode(state.roomCode);
      setPhase((prev) => {
        if (prev === "ended") return prev;
        if (prev === "landing") return "lobby";
        if (prev === "game" && state.status === "waiting") {
          setGameState(null);
          setHand(initialHandState);
          setPowerState(initialPowerState);
          setPendingPowerAction(null);
          setActiveEmotes({});
          return "lobby";
        }
        return prev;
      });
    };
    const handleGameStarted = (state: PublicGameState, handPayload: { cards: Card[] }) => {
      setGameState(state);
      setHand(handPayload.cards);
      setPendingWild(null);
      setPowerState(initialPowerState);
      setPendingPowerAction(null);
      setEndState(null);
      setActiveEmotes({});
      setPhase("game");
    };
    const handleStateUpdate = (state: PublicGameState) => {
      setGameState(state);
    };
    const handleHandUpdate = (payload: { cards: Card[] }) => {
      setHand(payload.cards);
    };
    const handlePowerStateUpdate = (payload: PowerStatePayload) => {
      setPowerState(payload);
    };
    const handleError = (payload: { message: string }) => {
      setLastError(payload.message);
      setTimeout(() => setLastError(undefined), 4000);
    };
    const handleGameEnded = (payload: GameEndedData) => {
      setEndState(payload);
      setPowerState(initialPowerState);
      setPendingPowerAction(null);
      setActiveEmotes({});
      setPhase("ended");
      void refreshProfile();
    };
    const handleRushAlert = (payload: RushAlertPayload) => {
      setRushNotice(`RUSH! ${payload.playerName} is down to one card!`);
      if (rushTimer.current) {
        clearTimeout(rushTimer.current);
      }
      rushTimer.current = setTimeout(() => setRushNotice(null), 4000);
    };
    const handleEmotePlayed = (payload: EmotePayload) => {
      showEmote(payload.playerId, payload.emote);
    };

    socket.on("connect", handleConnect);
    socket.on("lobbyUpdate", handleLobbyUpdate);
    socket.on("gameStarted", handleGameStarted);
    socket.on("stateUpdate", handleStateUpdate);
    socket.on("handUpdate", handleHandUpdate);
    socket.on("powerStateUpdate", handlePowerStateUpdate);
    socket.on("error", handleError);
    socket.on("gameEnded", handleGameEnded);
    socket.on("rushAlert", handleRushAlert);
    socket.on("emotePlayed", handleEmotePlayed);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("lobbyUpdate", handleLobbyUpdate);
      socket.off("gameStarted", handleGameStarted);
      socket.off("stateUpdate", handleStateUpdate);
      socket.off("handUpdate", handleHandUpdate);
      socket.off("powerStateUpdate", handlePowerStateUpdate);
      socket.off("error", handleError);
      socket.off("gameEnded", handleGameEnded);
      socket.off("rushAlert", handleRushAlert);
      socket.off("emotePlayed", handleEmotePlayed);
      if (rushTimer.current) {
        clearTimeout(rushTimer.current);
        rushTimer.current = null;
      }
    };
  }, [socket, setPhase, refreshProfile, showEmote]);

  const isHost = useMemo(() => {
    if (!lobbyState || !playerId) return false;
    return lobbyState.hostId === playerId;
  }, [lobbyState, playerId]);

  const canPlay = useMemo(() => {
    if (!gameState || !playerId) return false;
    return gameState.currentPlayerId === playerId;
  }, [gameState, playerId]);

  const mustDrawPower = useMemo(() => {
    if (!gameState || !playerId) return false;
    return (
      gameState.pendingPowerDrawPlayerId === playerId &&
      powerState.requiredDraws > 0
    );
  }, [gameState, playerId, powerState.requiredDraws]);

  const canPlayBase = canPlay && !mustDrawPower;
  const canDrawBase = canPlay && !mustDrawPower;

  const availableTargets = useMemo(() => {
    if (!gameState || !playerId) return [];
    return gameState.players.filter((player) => player.id !== playerId);
  }, [gameState, playerId]);

  const selectableColors = useMemo(() => {
    if (!pendingPowerAction || pendingPowerAction.mode !== "color") return [];
    const colors = new Set<typeof CARD_COLORS[number]>();
    for (const card of hand) {
      if (card.color !== "wild") {
        colors.add(card.color as typeof CARD_COLORS[number]);
      }
    }
    return CARD_COLORS.filter((color) => colors.has(color));
  }, [pendingPowerAction, hand]);

  const handleSendEmote = useCallback(
    (emote: EmoteType) => {
      socket.emit("sendEmote", emote);
      const sourceId = playerId ?? socket.id ?? null;
      if (sourceId) {
        showEmote(sourceId, emote);
      }
    },
    [socket, playerId, showEmote]
  );

  const handleCreateRoom = () => {
    if (!name.trim()) {
      setLastError("Enter a display name first");
      return;
    }
    socket.emit("createRoom", name.trim(), (room) => {
      const hostId = socket.id ?? playerId ?? "pending-host";

      setRoomCode(room);
      setLobbyState({
        roomCode: room,
        hostId,
        status: "waiting",
        players: [
          {
            id: hostId,
            name: name.trim(),
            isHost: true,
            cardCount: 0,
            hasCalledUno: false,
            powerCardCount: 0,
            powerPoints: 0,
            frozenForTurns: 0
          }
        ]
      });
      setPhase("lobby");
    });
  };

  const handleJoinRoom = () => {
    if (!name.trim() || !roomCode.trim()) {
      setLastError("Enter both name and room code");
      return;
    }
    const code = roomCode.trim().toUpperCase();
    socket.emit(
      "joinRoom",
      { roomCode: code, name: name.trim() },
      (success, message) => {
        if (!success) {
          setLastError(message ?? "Unable to join room");
          return;
        }
        setRoomCode(code);
        setPhase("lobby");
      }
    );
  };

  const handleLeave = () => {
    socket.emit("leaveRoom");
    setPhase("landing");
    setLobbyState(null);
    setGameState(null);
    setHand(initialHandState);
    setPowerState(initialPowerState);
    setPendingPowerAction(null);
    setPendingWild(null);
    setEndState(null);
    setRoomCode("");
    setRushNotice(null);
  };

  const handleStartGame = () => {
    socket.emit("startGame");
  };

  const handleDrawCard = () => {
    socket.emit("drawCard");
  };

  const handlePlayCard = (card: Card, color?: typeof CARD_COLORS[number]) => {
    if (isWildCard(card) && !color) {
      setPendingWild(card);
      return;
    }
    socket.emit("playCard", {
      cardId: card.id,
      chosenColor: color
    });
    setPendingWild(null);
  };

  const handleResolveWild = (color: typeof CARD_COLORS[number]) => {
    if (!pendingWild) return;
    handlePlayCard(pendingWild, color);
  };

  const handleDrawPowerCard = () => {
    socket.emit("drawPowerCard");
  };

  const handlePowerCardIntent = (card: PowerCard) => {
    if (!gameState) return;
    switch (card.type) {
      case "cardRush":
        socket.emit("playPowerCard", { cardId: card.id });
        break;
      case "freeze":
      case "swapHands":
        setPendingPowerAction({ card, mode: "target" });
        break;
      case "colorRush":
        setPendingPowerAction({ card, mode: "color" });
        break;
      default:
        break;
    }
  };

  const handlePowerTargetSelect = (targetId: string) => {
    if (!pendingPowerAction) return;
    socket.emit("playPowerCard", { cardId: pendingPowerAction.card.id, targetPlayerId: targetId });
    setPendingPowerAction(null);
  };

  const handlePowerColorSelect = (color: typeof CARD_COLORS[number]) => {
    if (!pendingPowerAction) return;
    socket.emit("playPowerCard", { cardId: pendingPowerAction.card.id, color });
    setPendingPowerAction(null);
  };

  const handleCancelPowerAction = () => {
    setPendingPowerAction(null);
  };

  const handleReplay = () => {
    setEndState(null);
    setPhase("lobby");
    setGameState(null);
    setHand(initialHandState);
    setPowerState(initialPowerState);
    setPendingPowerAction(null);
    setPendingWild(null);
    setRushNotice(null);
  };

  return (
    <div className="card-rush-wrapper min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <main className="relative z-10 mx-auto min-h-[80vh] max-w-5xl">
        <AccountPanel
          user={authUser}
          initializing={authInitializing}
          onLogin={login}
          onRegister={register}
          onLogout={logout}
          showExpanded={phase === "landing"}
        />
        {phase === "landing" && (
          <LandingPanel
            name={name}
            setName={setName}
            room={roomCode}
            setRoom={setRoomCode}
            onCreate={handleCreateRoom}
            onJoin={handleJoinRoom}
            error={lastError}
            accountUser={authUser}
          />
        )}
        {phase === "lobby" && lobbyState && (
          <LobbyPanel lobby={lobbyState} isHost={isHost} onStart={handleStartGame} onLeave={handleLeave} />
        )}
        {phase === "game" && gameState && (
          <GameBoard
            gameState={gameState}
            hand={hand}
            canPlayBase={canPlayBase}
            canDrawBase={canDrawBase}
            onPlay={handlePlayCard}
            onDraw={handleDrawCard}
            isResolvingWild={Boolean(pendingWild)}
            onResolveWild={handleResolveWild}
            powerState={powerState}
            onPowerCardSelect={handlePowerCardIntent}
            onPowerCardDraw={handleDrawPowerCard}
            mustDrawPower={mustDrawPower}
            localPlayerId={playerId}
            activeEmotes={activeEmotes}
            onSendEmote={handleSendEmote}
          />
        )}
        {phase === "ended" && endState && lobbyState && (
          <GameOverPanel data={endState} players={lobbyState.players} onPlayAgain={handleReplay} />
        )}
        {pendingPowerAction && gameState && (
          <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-80 rounded-3xl bg-slate-900 p-6 text-center shadow-2xl">
              <h3 className="text-lg font-semibold uppercase tracking-widest text-white/80">
                {POWER_CARD_INFO[pendingPowerAction.card.type].label}
              </h3>
              <p className="mb-4 text-xs text-white/60">
                {POWER_CARD_INFO[pendingPowerAction.card.type].description}
              </p>
              {pendingPowerAction.mode === "target" ? (
                availableTargets.length > 0 ? (
                  <div className="space-y-2">
                    {availableTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => handlePowerTargetSelect(target.id)}
                        className="w-full rounded-xl border border-white/15 bg-slate-800/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:border-emerald-300/60 hover:bg-slate-800"
                      >
                        {target.name} · {target.cardCount} card{target.cardCount === 1 ? "" : "s"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/60">No available targets right now.</p>
                )
              ) : selectableColors.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {selectableColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="rounded-xl px-4 py-3 text-sm font-semibold uppercase tracking-widest text-slate-950"
                      style={{
                        backgroundColor:
                          color === "yellow"
                            ? "#ffd93d"
                            : color === "blue"
                            ? "#2196f3"
                            : color === "red"
                            ? "#ff4d4d"
                            : "#4caf50"
                      }}
                      onClick={() => handlePowerColorSelect(color)}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/60">No matching colors in hand.</p>
              )}
              <button
                type="button"
                onClick={handleCancelPowerAction}
                className="mt-5 w-full rounded-xl border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </main>
      {lastError && phase !== "landing" && (
        <div className="fixed bottom-6 right-6 rounded-xl bg-red-500/90 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {lastError}
        </div>
      )}
      {rushNotice && (
        <div className="fixed bottom-6 left-6 rounded-xl bg-amber-400/90 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-amber-950 shadow-lg">
          {rushNotice}
        </div>
      )}
    </div>
  );
};

export default App;
