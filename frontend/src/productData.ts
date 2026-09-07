import type { ProductCard, TradeEvent } from "./types";

export function latestCards(events: TradeEvent[]): ProductCard[] {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== "tool.result") continue;
    const cards = event.payload?.hits as ProductCard[] | undefined;
    if (Array.isArray(cards) && cards.length > 0) return cards;
  }
  return [];
}

export interface KnownSpecs {
  weight?: string;
  material?: string;
  foldedLength?: string;
}

export function extractKnownSpecs(card: ProductCard): KnownSpecs {
  const highlights = card.highlights ?? [];
  const weight = highlights.find((value) => /(?:\d+(?:\.\d+)?\s?(?:g|kg|克|公斤)|重量|weight)/i.test(value));
  const material = highlights.find((value) => /碳纤维|铝合金|钛合金|塑料|不锈钢/i.test(value));
  const foldedLength = highlights.find((value) => /折叠|收纳长度/i.test(value))
    ?.match(/\d+(?:\.\d+)?\s?cm/i)?.[0];
  return { weight, material, foldedLength };
}

export function latestFinalText(events: TradeEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== "final.result") continue;
    const text = event.payload?.text;
    if (typeof text === "string" && text.trim()) return text;
  }
  return null;
}
