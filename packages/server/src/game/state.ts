import type {
  Card,
  CardColor,
  GameEndedPayload,
  PlayerSummary,
  PublicGameState
} from "@codex-card/shared";
import { buildDeck, canPlayCard, shuffle } from "./cards.js";

export interface InternalPlayerState {
  id: string;
  name: string;
  hand: Card[];
  hasCalledUno: boolean;
  connected: boolean;
}

export interface CreateGameOptions {
  roomCode: string;
  players: InternalPlayerState[];
}

export interface PlayCardResult {
  penaltyApplied: boolean;
  winnerId?: string;
}

const DEFAULT_DRAW_COUNT = 1;

export class UnoGame {
  private readonly roomCode: string;
  private players: InternalPlayerState[];
  private deck: Card[] = [];
  private discardPile: Card[] = [];
  private currentPlayerIndex = 0;
  private direction: 1 | -1 = 1;
  private drawStack = 0;
  private currentColor: CardColor = "red";
  private startedAt: Date = new Date();
  private hasStarted = false;
  private winnerId: string | null = null;

  constructor(options: CreateGameOptions) {
    this.roomCode = options.roomCode;
    this.players = options.players;
  }

  get isActive() {
    return this.hasStarted && !this.winnerId;
  }

  getDrawStack() {
    return this.drawStack;
  }

  getCurrentColor() {
    return this.currentColor;
  }

  start() {
    if (this.hasStarted) return;

    this.deck = buildDeck();
    this.discardPile = [];

    for (const player of this.players) {
      const drawn = this.takeCards(7);
      player.hand = drawn;
      player.hasCalledUno = false;
    }

    let firstCard = this.deck.shift();
    while (firstCard && firstCard.color === "wild") {
      this.deck.push(firstCard);
      this.deck = shuffle(this.deck);
      firstCard = this.deck.shift();
    }

    if (!firstCard) {
      throw new Error("Unable to initialize discard pile");
    }

    this.discardPile.push(firstCard);
    this.currentColor = firstCard.color;
    this.direction = 1;
    this.drawStack = 0;
    this.currentPlayerIndex = 0;
    this.startedAt = new Date();
    this.hasStarted = true;
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getPlayer(playerId: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) {
      throw new Error("Player not found");
    }
    return player;
  }

  getHand(playerId: string) {
    return [...this.getPlayer(playerId).hand];
  }

  getPublicState(hostId: string): PublicGameState {
    if (!this.hasStarted) {
      throw new Error("Game not started");
    }

    const topCard = this.getTopCard();

    return {
      roomCode: this.roomCode,
      players: this.players.map<PlayerSummary>((player) => ({
        id: player.id,
        name: player.name,
        isHost: player.id === hostId,
        cardCount: player.hand.length,
        hasCalledUno: player.hasCalledUno
      })),
      currentPlayerId: this.getCurrentPlayer().id,
      direction: this.direction,
      discardTop: topCard,
      currentColor: this.currentColor,
      drawStack: this.drawStack,
      startedAt: this.startedAt.toISOString()
    };
  }

  getTopCard(): Card {
    const top = this.discardPile[this.discardPile.length - 1];
    if (!top) {
      throw new Error("Discard pile empty");
    }
    return top;
  }

  draw(playerId: string) {
    this.ensureTurn(playerId);

    const isPenaltyDraw = this.drawStack > 0;
    const amount = isPenaltyDraw ? this.drawStack : DEFAULT_DRAW_COUNT;

    const drawnCards = this.takeCards(amount);
    const player = this.getPlayer(playerId);
    player.hand.push(...drawnCards);
    player.hasCalledUno = false;

    if (isPenaltyDraw) {
      this.drawStack = 0;
    }

    this.advanceTurn(1);
  }

  playCard(playerId: string, cardId: string, chosenColor?: CardColor): PlayCardResult {
    this.ensureTurn(playerId);

    const player = this.getPlayer(playerId);
    const cardIndex = player.hand.findIndex((card) => card.id === cardId);
    if (cardIndex === -1) {
      throw new Error("Card not found in hand");
    }

    const card = player.hand[cardIndex];
    const topCard = this.getTopCard();

    const resolvedColor = card.color === "wild" ? chosenColor : card.color;
    if (card.color === "wild" && !resolvedColor) {
      throw new Error("Wild cards require a chosen color");
    }

    if (!canPlayCard(card, topCard, this.currentColor, this.drawStack)) {
      throw new Error("Card cannot be played");
    }

    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    if (card.color === "wild") {
      this.currentColor = resolvedColor!;
    } else {
      this.currentColor = card.color;
    }

    let skipCount = 1;
    switch (card.value) {
      case "reverse": {
        if (this.players.length === 2) {
          skipCount = 2;
        }
        this.direction = this.direction === 1 ? -1 : 1;
        break;
      }
      case "skip": {
        skipCount = 2;
        break;
      }
      case "draw2": {
        this.drawStack += 2;
        break;
      }
      case "wild4": {
        this.drawStack += 4;
        break;
      }
      default:
        break;
    }

    player.hasCalledUno = player.hand.length === 1;

    if (player.hand.length === 0) {
      this.winnerId = player.id;
      return { penaltyApplied: false, winnerId: player.id };
    }

    this.advanceTurn(skipCount);
    return { penaltyApplied: false };
  }

  getWinnerPayload(): GameEndedPayload | null {
    if (!this.winnerId) return null;

    const winner = this.getPlayer(this.winnerId);
    const scores: Record<string, number> = {};

    for (const player of this.players) {
      if (player.id === winner.id) continue;
      scores[player.id] = calculateHandScore(player.hand);
    }

    const winnerScore = Object.values(scores).reduce((sum, points) => sum + points, 0);
    scores[winner.id] = winnerScore;

    return {
      winnerId: winner.id,
      scores
    };
  }

 
  private ensureTurn(playerId: string) {
    if (!this.hasStarted) {
      throw new Error("Game not started");
    }
    if (this.getCurrentPlayer().id !== playerId) {
      throw new Error("Not your turn");
    }
    if (this.winnerId) {
      throw new Error("Game already ended");
    }
  }

  private advanceTurn(skipCount: number) {
    const totalPlayers = this.players.length;
    for (let i = 0; i < skipCount; i += 1) {
      this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + totalPlayers) % totalPlayers;
    }

    const nextPlayer = this.getCurrentPlayer();
    nextPlayer.hasCalledUno = false;
  }

  private ensureDeckSize() {
    if (this.deck.length === 0) {
      const top = this.discardPile.pop();
      if (!top) return;
      this.deck = shuffle(this.discardPile);
      this.discardPile = [top];
    }
  }

  private takeCards(count: number) {
    const cards: Card[] = [];
    for (let i = 0; i < count; i += 1) {
      this.ensureDeckSize();
      const card = this.deck.shift();
      if (!card) break;
      cards.push(card);
    }
    return cards;
  }
}

const calculateHandScore = (hand: Card[]) => {
  return hand.reduce((sum, card) => {
    if (!Number.isNaN(Number(card.value))) {
      return sum + Number(card.value);
    }
    if (card.value === "draw2" || card.value === "reverse" || card.value === "skip") {
      return sum + 20;
    }
    return sum + 50;
  }, 0);
};
