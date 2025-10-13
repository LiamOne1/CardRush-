import type {
  ActionCardValue,
  Card,
  CardColor,
  GameEndedPayload,
  PlayPowerCardPayload,
  PlayerSummary,
  PowerCard,
  PowerStatePayload,
  PublicGameState
} from "@code-card/shared";
import { buildDeck, buildPowerDeck, canPlayCard, shuffle } from "./cards.js";

export interface InternalPlayerState {
  id: string;
  name: string;
  hand: Card[];
  hasCalledUno: boolean;
  connected: boolean;
  powerCards: PowerCard[];
  powerPoints: number;
  hasPlayedPowerCardThisTurn: boolean;
  isAwaitingPowerDraw: boolean;
  pendingSkipCount: number | null;
  frozenForTurns: number;
}

export interface CreateGameOptions {
  roomCode: string;
  players: InternalPlayerState[];
}

export interface PlayCardResult {
  penaltyApplied: boolean;
  winnerId?: string;
  powerDrawRequired?: boolean;
}

export interface PlayPowerCardResult {
  affectedPlayerIds: string[];
}

const DEFAULT_DRAW_COUNT = 1;
const FREEZE_TURNS = 2;
const ACTION_CARD_POINTS: Record<ActionCardValue, number> = {
  skip: 1,
  reverse: 1,
  draw2: 2,
  wild: 2,
  wild4: 3
};

export class UnoGame {
  private readonly roomCode: string;
  private players: InternalPlayerState[];
  private deck: Card[] = [];
  private discardPile: Card[] = [];
  private powerDeck: PowerCard[] = [];
  private currentPlayerIndex = 0;
  private direction: 1 | -1 = 1;
  private drawStack = 0;
  private currentColor: CardColor = "red";
  private startedAt: Date = new Date();
  private hasStarted = false;
  private winnerId: string | null = null;
  private pendingPowerDrawPlayerId: string | null = null;
  private readonly powerCardCost = 4;
  private pendingHandSyncs = new Set<string>();

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
    this.powerDeck = buildPowerDeck();
    this.pendingPowerDrawPlayerId = null;

    for (const player of this.players) {
      const drawn = this.takeCards(7);
      player.hand = drawn;
      player.hasCalledUno = false;
      player.powerCards = [];
      player.powerPoints = 0;
      player.hasPlayedPowerCardThisTurn = false;
      player.isAwaitingPowerDraw = false;
      player.pendingSkipCount = null;
      player.frozenForTurns = 0;
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
    this.prepareCurrentPlayerForTurn();
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

  getPowerState(playerId: string): PowerStatePayload {
    const player = this.getPlayer(playerId);
    return {
      points: player.powerPoints,
      cards: [...player.powerCards],
      requiredDraws: this.getRequiredPowerDraws(player)
    };
  }

  consumePendingHandSyncs() {
    const ids = Array.from(this.pendingHandSyncs);
    this.pendingHandSyncs.clear();
    return ids;
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
        hasCalledUno: player.hasCalledUno,
        powerCardCount: player.powerCards.length,
        powerPoints: player.powerPoints,
        frozenForTurns: player.frozenForTurns
      })),
      currentPlayerId: this.getCurrentPlayer().id,
      direction: this.direction,
      discardTop: topCard,
      currentColor: this.currentColor,
      drawStack: this.drawStack,
      startedAt: this.startedAt.toISOString(),
      pendingPowerDrawPlayerId: this.pendingPowerDrawPlayerId
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

    const player = this.getPlayer(playerId);
    if (player.isAwaitingPowerDraw) {
      throw new Error("Draw your power card before ending your turn");
    }

    const isPenaltyDraw = this.drawStack > 0;
    const amount = isPenaltyDraw ? this.drawStack : DEFAULT_DRAW_COUNT;

    const drawnCards = this.takeCards(amount);
    player.hand.push(...drawnCards);
    player.hasCalledUno = false;
    player.pendingSkipCount = null;
    this.markHandDirty(player);

    if (isPenaltyDraw) {
      this.drawStack = 0;
    }

    this.advanceTurn(1);
  }

  playCard(playerId: string, cardId: string, chosenColor?: CardColor): PlayCardResult {
    this.ensureTurn(playerId);

    const player = this.getPlayer(playerId);
    if (player.isAwaitingPowerDraw) {
      throw new Error("Draw your power card before playing another card");
    }

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
    this.markHandDirty(player);

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

    const pointsAwarded = ACTION_CARD_POINTS[card.value as ActionCardValue] ?? 0;
    if (pointsAwarded > 0) {
      player.powerPoints += pointsAwarded;
    }

    const requiresPowerDraw = this.evaluatePowerDrawRequirement(player, skipCount);

    if (requiresPowerDraw) {
      return { penaltyApplied: false, powerDrawRequired: true };
    }

    this.advanceTurn(skipCount);
    return { penaltyApplied: false };
  }

  drawPowerCard(playerId: string): PowerCard {
    this.ensureTurn(playerId);

    const player = this.getPlayer(playerId);
    const requiredDraws = this.getRequiredPowerDraws(player);
    if (requiredDraws <= 0) {
      throw new Error("Not enough points to draw a power card");
    }

    this.ensurePowerDeckSize();
    const card = this.powerDeck.shift();
    if (!card) {
      throw new Error("Power deck is empty");
    }

    player.powerCards.push(card);
    player.powerPoints -= this.powerCardCost;
    if (player.powerPoints < 0) {
      player.powerPoints = 0;
    }

    const remaining = this.getRequiredPowerDraws(player);
    if (remaining > 0) {
      player.isAwaitingPowerDraw = true;
      this.pendingPowerDrawPlayerId = player.id;
    } else {
      player.isAwaitingPowerDraw = false;
      this.pendingPowerDrawPlayerId = null;
      const skipCount = player.pendingSkipCount ?? 1;
      player.pendingSkipCount = null;
      this.advanceTurn(skipCount);
    }

    return card;
  }

  playPowerCard(playerId: string, payload: PlayPowerCardPayload): PlayPowerCardResult {
    this.ensureTurn(playerId);

    const player = this.getPlayer(playerId);
    if (player.isAwaitingPowerDraw) {
      throw new Error("Draw your power card before playing one");
    }
    if (player.hasPlayedPowerCardThisTurn) {
      throw new Error("You have already played a power card this turn");
    }

    const cardIndex = player.powerCards.findIndex((power) => power.id === payload.cardId);
    if (cardIndex === -1) {
      throw new Error("Power card not found");
    }

    const [powerCard] = player.powerCards.splice(cardIndex, 1);
    const affectedPlayerIds = new Set<string>();

    try {
      switch (powerCard.type) {
        case "cardRush": {
          for (const target of this.players) {
            if (target.id === player.id) continue;
            const drawn = this.takeCards(2);
            if (drawn.length === 0) continue;
            target.hand.push(...drawn);
            target.hasCalledUno = false;
            this.markHandDirty(target);
            affectedPlayerIds.add(target.id);
          }
          break;
        }
        case "freeze": {
          const targetId = payload.targetPlayerId;
          if (!targetId || targetId === player.id) {
            throw new Error("Select another player to freeze");
          }
          const target = this.getPlayer(targetId);
          target.frozenForTurns += FREEZE_TURNS;
          break;
        }
        case "colorRush": {
          const color = payload.color;
          if (!color || color === "wild") {
            throw new Error("Select a valid color to discard");
          }
          if (!player.hand.some((handCard) => handCard.color === color)) {
            throw new Error("You do not have any cards of that color");
          }

          const remaining: Card[] = [];
          const removed: Card[] = [];

          for (const handCard of player.hand) {
            if (handCard.color === color) {
              removed.push(handCard);
            } else {
              remaining.push(handCard);
            }
          }

          player.hand = remaining;
          player.hasCalledUno = player.hand.length === 1;
          this.markHandDirty(player);

          this.deck.push(...removed);
          this.deck = shuffle(this.deck);

          affectedPlayerIds.add(player.id);
          break;
        }
        case "swapHands": {
          const targetId = payload.targetPlayerId;
          if (!targetId || targetId === player.id) {
            throw new Error("Select another player to swap with");
          }
          const target = this.getPlayer(targetId);

          const tempHand = player.hand;
          player.hand = target.hand;
          target.hand = tempHand;

          player.hasCalledUno = player.hand.length === 1;
          target.hasCalledUno = target.hand.length === 1;

          this.markHandDirty(player);
          this.markHandDirty(target);

          affectedPlayerIds.add(player.id);
          affectedPlayerIds.add(target.id);
          break;
        }
        default:
          throw new Error("Unknown power card");
      }
    } catch (error) {
      player.powerCards.splice(cardIndex, 0, powerCard);
      throw error;
    }

    player.hasPlayedPowerCardThisTurn = true;
    return { affectedPlayerIds: Array.from(affectedPlayerIds) };
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
    if (this.players.length === 0) return;
    this.moveSteps(skipCount);
    this.prepareCurrentPlayerForTurn();
    this.resolveFrozenPlayers();
  }

  private prepareCurrentPlayerForTurn() {
    const player = this.getCurrentPlayer();
    player.hasCalledUno = false;
    player.hasPlayedPowerCardThisTurn = false;
  }

  private resolveFrozenPlayers() {
    if (this.players.length === 0) return;
    let safety = 0;

    while (this.players.length > 0) {
      const player = this.getCurrentPlayer();
      if (player.frozenForTurns <= 0) {
        return;
      }

      player.frozenForTurns -= 1;
      player.isAwaitingPowerDraw = false;
      player.pendingSkipCount = null;
      player.hasPlayedPowerCardThisTurn = false;

      if (this.drawStack > 0) {
        const drawn = this.takeCards(this.drawStack);
        if (drawn.length > 0) {
          player.hand.push(...drawn);
          this.markHandDirty(player);
        }
        player.hasCalledUno = false;
        this.drawStack = 0;
      }

      this.moveSteps(1);
      this.prepareCurrentPlayerForTurn();

      safety += 1;
      if (safety > this.players.length * 4) {
        throw new Error("Unable to resolve frozen player turns");
      }
    }
  }

  private moveSteps(steps: number) {
    if (this.players.length === 0) return;
    const totalPlayers = this.players.length;
    const normalized = ((steps % totalPlayers) + totalPlayers) % totalPlayers;
    const offset = (normalized * this.direction + totalPlayers) % totalPlayers;
    this.currentPlayerIndex = (this.currentPlayerIndex + offset + totalPlayers) % totalPlayers;
  }

  private ensureDeckSize() {
    if (this.deck.length === 0) {
      const top = this.discardPile.pop();
      if (!top) return;
      this.deck = shuffle(this.discardPile);
      this.discardPile = [top];
    }
  }

  private ensurePowerDeckSize() {
    if (this.powerDeck.length === 0) {
      this.powerDeck = buildPowerDeck();
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

  private getRequiredPowerDraws(player: InternalPlayerState) {
    if (player.powerPoints <= 0) return 0;
    return Math.floor(player.powerPoints / this.powerCardCost);
  }

  private evaluatePowerDrawRequirement(player: InternalPlayerState, skipCount: number) {
    const required = this.getRequiredPowerDraws(player);
    if (required <= 0) {
      if (this.pendingPowerDrawPlayerId === player.id) {
        this.pendingPowerDrawPlayerId = null;
      }
      player.isAwaitingPowerDraw = false;
      player.pendingSkipCount = null;
      return false;
    }

    player.isAwaitingPowerDraw = true;
    player.pendingSkipCount = skipCount;
    this.pendingPowerDrawPlayerId = player.id;
    return true;
  }

  private markHandDirty(player: InternalPlayerState) {
    this.pendingHandSyncs.add(player.id);
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
