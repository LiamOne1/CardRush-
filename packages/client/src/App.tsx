import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Card,
  LobbyState,
  PlayerSummary,
  PublicGameState,
  RushAlertPayload
} from "@code-card/shared";
import { CARD_COLORS } from "@code-card/shared";
import { UnoCard } from "./components/Card";
import { PlayerBadge } from "./components/PlayerBadge";
import { useSocket } from "./providers/socket-provider";

interface GameEndedData {
  winnerId: string;
  scores: Record<string, number>;
}

const initialHandState: Card[] = [];

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

const GameBoard: React.FC<{
  gameState: PublicGameState;
  hand: Card[];
  canPlay: boolean;
  onPlay: (card: Card, color?: typeof CARD_COLORS[number]) => void;
  onDraw: () => void;
  isResolvingWild: boolean;
  onResolveWild: (color: typeof CARD_COLORS[number]) => void;
}> = ({
  gameState,
  hand,
  canPlay,
  onPlay,
  onDraw,
  isResolvingWild,
  onResolveWild
}) => {
  const { discardTop, currentPlayerId, currentColor, players, drawStack } = gameState;

  return (
    <div className="flex h-full flex-col gap-8">
      <section className="grid grid-cols-1 gap-4 rounded-3xl border border-white/10 bg-slate-900/30 p-4 backdrop-blur sm:grid-cols-2">
        {players.map((player) => (
          <PlayerBadge key={player.id} player={player} isActive={player.id === currentPlayerId} />
        ))}
      </section>

      <section className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden rounded-[2.25rem] border border-white/15 bg-gradient-to-br from-cyan-500/20 via-indigo-500/15 to-fuchsia-500/20 p-8 text-white shadow-[0_0_45px_rgba(96,165,250,0.25)] backdrop-blur-lg">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs uppercase tracking-[0.5em] text-white/60">Discard</p>
          <UnoCard card={discardTop} disabled onSelect={() => undefined} />
          <p className="text-sm uppercase tracking-[0.4em] text-white/80">Color: {currentColor.toUpperCase()}</p>
          {drawStack > 0 && (
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-amber-200">Draw stack +{drawStack}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onDraw}
            className="rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 px-8 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-slate-900 shadow-lg shadow-rose-500/30 transition hover:brightness-105"
          >
            Draw Card
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl uppercase tracking-[0.4em] text-white">Your Hand</h2>
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">
            {canPlay ? "Your turn" : "Waiting for opponents"}
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          {hand.map((card) => (
            <UnoCard
              key={card.id}
              card={card}
              disabled={!canPlay}
              onSelect={(selected) => {
                if (!canPlay) return;
                if (isWildCard(selected)) {
                  onPlay(selected);
                } else {
                  onPlay(selected);
                }
              }}
            />
          ))}
          {hand.length === 0 && <p className="text-sm text-white/60">No cards in hand.</p>}
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
}> = ({ name, setName, room, setRoom, onCreate, onJoin, error }) => {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-white shadow-2xl">
      <header className="text-center">
        <h1 className="font-display text-4xl uppercase tracking-[0.4em] text-white">Card Rush!</h1>
        <p className="mt-4 text-sm text-white/60">
          Create a lobby or join with a room code. Plays best with 2-4 friends.
        </p>
      </header>

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

  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [hand, setHand] = useState<Card[]>(initialHandState);
  const [pendingWild, setPendingWild] = useState<Card | null>(null);
  const [lastError, setLastError] = useState<string | undefined>();
  const [endState, setEndState] = useState<GameEndedData | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [rushNotice, setRushNotice] = useState<string | null>(null);
  const rushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          return "lobby";
        }
        return prev;
      });
    };
    const handleGameStarted = (state: PublicGameState, handPayload: { cards: Card[] }) => {
      setGameState(state);
      setHand(handPayload.cards);
      setPendingWild(null);
      setEndState(null);
      setPhase("game");
    };
    const handleStateUpdate = (state: PublicGameState) => {
      setGameState(state);
    };
    const handleHandUpdate = (payload: { cards: Card[] }) => {
      setHand(payload.cards);
    };
    const handleError = (payload: { message: string }) => {
      setLastError(payload.message);
      setTimeout(() => setLastError(undefined), 4000);
    };
    const handleGameEnded = (payload: GameEndedData) => {
      setEndState(payload);
      setPhase("ended");
    };
    const handleRushAlert = (payload: RushAlertPayload) => {
      setRushNotice(`RUSH! ${payload.playerName} is down to one card!`);
      if (rushTimer.current) {
        clearTimeout(rushTimer.current);
      }
      rushTimer.current = setTimeout(() => setRushNotice(null), 4000);
    };

    socket.on("connect", handleConnect);
    socket.on("lobbyUpdate", handleLobbyUpdate);
    socket.on("gameStarted", handleGameStarted);
    socket.on("stateUpdate", handleStateUpdate);
    socket.on("handUpdate", handleHandUpdate);
    socket.on("error", handleError);
    socket.on("gameEnded", handleGameEnded);
    socket.on("rushAlert", handleRushAlert);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("lobbyUpdate", handleLobbyUpdate);
      socket.off("gameStarted", handleGameStarted);
      socket.off("stateUpdate", handleStateUpdate);
      socket.off("handUpdate", handleHandUpdate);
      socket.off("error", handleError);
      socket.off("gameEnded", handleGameEnded);
      socket.off("rushAlert", handleRushAlert);
      if (rushTimer.current) {
        clearTimeout(rushTimer.current);
        rushTimer.current = null;
      }
    };
  }, [socket, setPhase]);

  const isHost = useMemo(() => {
    if (!lobbyState || !playerId) return false;
    return lobbyState.hostId === playerId;
  }, [lobbyState, playerId]);

  const canPlay = useMemo(() => {
    if (!gameState || !playerId) return false;
    return gameState.currentPlayerId === playerId;
  }, [gameState, playerId]);

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
            hasCalledUno: false
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

  const handleReplay = () => {
    setEndState(null);
    setPhase("lobby");
    setGameState(null);
    setHand(initialHandState);
    setRushNotice(null);
  };

  return (
    <div className="card-rush-wrapper min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <main className="relative z-10 mx-auto min-h-[80vh] max-w-5xl">
        {phase === "landing" && (
          <LandingPanel
            name={name}
            setName={setName}
            room={roomCode}
            setRoom={setRoomCode}
            onCreate={handleCreateRoom}
            onJoin={handleJoinRoom}
            error={lastError}
          />
        )}
        {phase === "lobby" && lobbyState && (
          <LobbyPanel lobby={lobbyState} isHost={isHost} onStart={handleStartGame} onLeave={handleLeave} />
        )}
        {phase === "game" && gameState && (
          <GameBoard
            gameState={gameState}
            hand={hand}
            canPlay={canPlay}
            onPlay={handlePlayCard}
            onDraw={handleDrawCard}
            isResolvingWild={Boolean(pendingWild)}
            onResolveWild={handleResolveWild}
          />
        )}
        {phase === "ended" && endState && lobbyState && (
          <GameOverPanel data={endState} players={lobbyState.players} onPlayAgain={handleReplay} />
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
