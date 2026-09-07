import type { ProductCard, TradeEvent } from "./types";

/**
 * 获取当前 turn 中最新一次 product_search_tool 的 hits。
 * 
 * Current turn 定义：
 * - 如果当前 turn 已完成：从倒数第二个 final.result 到最后一个 final.result 之间
 * - 如果当前 turn 仍在进行：从最后一个 final.result 之后到当前
 * - 如果没有 final.result：从 session 开始到当前
 */
export function getLatestProductHitsForCurrentTurn(events: TradeEvent[]): ProductCard[] {
  // 收集所有 final.result 的索引
  const finalResultIndices: number[] = [];
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].type === "final.result") {
      finalResultIndices.push(index);
    }
  }
  
  let start: number;
  let end: number;
  
  if (finalResultIndices.length === 0) {
    // 没有 final.result：从 session 开始到当前
    start = 0;
    end = events.length;
  } else {
    const lastFinalIndex = finalResultIndices[finalResultIndices.length - 1];
    
    // 检查最后一个 event 是否是 final.result（判断当前 turn 是否已完成）
    const lastEventIsFinal = events.length > 0 && events[events.length - 1].type === "final.result";
    
    if (lastEventIsFinal || finalResultIndices.length >= 2) {
      // CASE B: 当前 turn 已完成，或有至少两个 final.result
      // 查找范围：倒数第二个 final.result 之后 到 最后一个 final.result
      const secondLastFinalIndex = finalResultIndices.length >= 2 
        ? finalResultIndices[finalResultIndices.length - 2] 
        : 0;
      start = secondLastFinalIndex + 1;
      end = lastFinalIndex + 1; // 包含最后一个 final.result
    } else {
      // CASE A: 当前 turn 仍在进行中
      // 查找范围：最后一个 final.result 之后 到 当前
      start = lastFinalIndex + 1;
      end = events.length;
    }
  }
  
  // 在 [start, end) 范围内从后往前找最新一次 product_search_tool 的 tool.result
  for (let index = end - 1; index >= start; index -= 1) {
    const event = events[index];
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
