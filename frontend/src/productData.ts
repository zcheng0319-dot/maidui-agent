import type { ProductCard, TradeEvent } from "./types";

/**
 * 获取当前 turn 中最新一次 product_search_tool 的 hits。
 * 
 * Current turn 定义：从上一条 final.result 之后到当前。
 * 如果没有 final.result，则从 session 开始算起。
 */
export function getLatestProductHitsForCurrentTurn(events: TradeEvent[]): ProductCard[] {
  // 找到最后一条 final.result 的位置
  let start = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === "final.result") {
      start = index + 1;
      break;
    }
  }
  
  // 只搜索当前 turn 的 events
  const currentTurnEvents = events.slice(start);
  
  // 从后往前找最新一次 product_search_tool 的 tool.result
  for (let index = currentTurnEvents.length - 1; index >= 0; index -= 1) {
    const event = currentTurnEvents[index];
    if (event.type !== "tool.result") continue;
    
    const toolName = String(event.payload?.tool ?? "").toLowerCase();
    if (!/product_search/.test(toolName)) continue;
    
    const hits = event.payload?.hits as ProductCard[] | undefined;
    if (Array.isArray(hits) && hits.length > 0) {
      return hits;
    }
  }
  
  return [];
}

/**
 * 向后兼容：保留原有的 latestCards 函数，但标记为 deprecated。
 * 新代码应使用 getLatestProductHitsForCurrentTurn。
 */
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
  const weight = highlights.find((value) => {
    if (/承重|负重|载重|max\s*load/i.test(value)) return false;
    return /(?:重量|自重|单支|超轻|weight)/i.test(value)
      && /\d+(?:\.\d+)?\s?(?:g|kg|克|公斤)/i.test(value);
  });
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
