import { nanoid } from "nanoid";
import type { Card, CardColor } from "@code-card/shared";
import * as Shared from "@code-card/shared";

const { ACTION_CARD_VALUES, CARD_COLORS, NUMBER_CARD_VALUES } = Shared;

export const buildDeck = (): Card[] => {
  const deck: Card[] = [];

  for (const color of CARD_COLORS) {
    deck.push({ id: nanoid(), color, value: "0" });

    for (const value of NUMBER_CARD_VALUES.filter((v) => v !== "0")) {
      deck.push({ id: nanoid(), color, value });
      deck.push({ id: nanoid(), color, value });
    }

    for (const action of ACTION_CARD_VALUES.filter((a) => a === "skip" || a === "reverse" || a === "draw2")) {
      deck.push({ id: nanoid(), color, value: action });
      deck.push({ id: nanoid(), color, value: action });
    }
  }

  for (let i = 0; i < 4; i += 1) {
    deck.push({ id: nanoid(), color: "wild", value: "wild" });
    deck.push({ id: nanoid(), color: "wild", value: "wild4" });
  }

  return shuffle(deck);
};

export const shuffle = <T>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const drawCards = (deck: Card[], count: number): { drawn: Card[]; deck: Card[] } => {
  const drawn: Card[] = [];
  const remaining = [...deck];

  for (let i = 0; i < count; i += 1) {
    const card = remaining.shift();
    if (!card) break;
    drawn.push(card);
  }

  return { drawn, deck: remaining };
};

export const canPlayCard = (
  card: Card,
  topCard: Card,
  currentColor: CardColor,
  drawStack: number
) => {
  if (card.color === "wild") {
    return true;
  }

  if (drawStack > 0) {
    return card.value === "draw2" || card.value === "wild4";
  }

  return card.color === currentColor || card.value === topCard.value;
};
