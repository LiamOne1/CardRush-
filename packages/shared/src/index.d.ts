export type PlayerId = string;
export type RoomCode = string;
export type CardColor = "red" | "yellow" | "green" | "blue" | "wild";
export type ActionCardValue = "skip" | "reverse" | "draw2" | "wild" | "wild4";
export type NumberCardValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type CardValue = NumberCardValue | ActionCardValue;
export type PowerCardType = "cardRush" | "freeze" | "colorRush" | "swapHands";
export type EmoteType = "angry" | "sad" | "happy" | "shocked" | "poop";
export interface Card {
    id: string;
    color: CardColor;
    value: CardValue;
}
export interface PowerCard {
    id: string;
    type: PowerCardType;
}
export interface PlayerSummary {
    id: PlayerId;
    name: string;
    isHost: boolean;
    cardCount: number;
    hasCalledUno: boolean;
    powerCardCount: number;
    powerPoints: number;
    frozenForTurns: number;
}
export interface LobbyState {
    roomCode: RoomCode;
    players: PlayerSummary[];
    hostId: PlayerId;
    status: "waiting" | "in-progress";
}
export interface PublicGameState {
    roomCode: RoomCode;
    players: PlayerSummary[];
    currentPlayerId: PlayerId;
    direction: 1 | -1;
    discardTop: Card;
    currentColor: CardColor;
    drawStack: number;
    startedAt: string;
    pendingPowerDrawPlayerId: PlayerId | null;
}
export interface HandUpdate {
    cards: Card[];
}
export interface GameEndedPayload {
    winnerId: PlayerId;
    scores: Record<PlayerId, number>;
}
export interface ErrorPayload {
    message: string;
}
export interface PowerStatePayload {
    points: number;
    cards: PowerCard[];
    requiredDraws: number;
}
export interface RushAlertPayload {
    playerId: PlayerId;
    playerName: string;
}
export interface EmotePayload {
    playerId: PlayerId;
    emote: EmoteType;
}
export interface ServerToClientEvents {
    lobbyUpdate: (state: LobbyState) => void;
    gameStarted: (state: PublicGameState, hand: HandUpdate) => void;
    stateUpdate: (state: PublicGameState) => void;
    handUpdate: (hand: HandUpdate) => void;
    error: (payload: ErrorPayload) => void;
    gameEnded: (payload: GameEndedPayload) => void;
    rushAlert: (payload: RushAlertPayload) => void;
    powerStateUpdate: (payload: PowerStatePayload) => void;
    emotePlayed: (payload: EmotePayload) => void;
}
export interface JoinRoomPayload {
    roomCode: RoomCode;
    name: string;
}
export interface PlayCardPayload {
    cardId: string;
    chosenColor?: Exclude<CardColor, "wild">;
}
export interface PlayPowerCardPayload {
    cardId: string;
    targetPlayerId?: PlayerId;
    color?: Exclude<CardColor, "wild">;
}
export interface ClientToServerEvents {
    createRoom: (name: string, callback: (roomCode: RoomCode) => void) => void;
    joinRoom: (payload: JoinRoomPayload, callback: (success: boolean, message?: string) => void) => void;
    startGame: () => void;
    playCard: (payload: PlayCardPayload) => void;
    drawCard: () => void;
    drawPowerCard: () => void;
    playPowerCard: (payload: PlayPowerCardPayload) => void;
    leaveRoom: () => void;
    updateAuth: (payload: {
        token: string | null;
    }) => void;
    sendEmote: (emote: EmoteType) => void;
}
export interface InterServerEvents {
}
export interface SocketData {
    playerId: PlayerId;
    roomCode?: RoomCode;
    name?: string;
    userId?: string;
}
export declare const CARD_COLORS: Exclude<CardColor, "wild">[];
export declare const NUMBER_CARD_VALUES: NumberCardValue[];
export declare const ACTION_CARD_VALUES: ActionCardValue[];
export declare const POWER_CARD_TYPES: PowerCardType[];
