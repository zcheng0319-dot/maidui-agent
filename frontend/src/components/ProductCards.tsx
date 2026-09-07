import { useState } from "react";
import type { ProductCard, TradeEvent } from "../types";
import { latestCards } from "../productData";

/** 从最近一次 product_search 相关的工具事件里取商品卡（工具结果 JSON 由 Agent 侧透传）。 */
/** 提取首字作为卡片装饰首字母 */
function letterOf(card: ProductCard): string {
  const t = (card.title ?? card.brand ?? "?").trim();
  return t.charAt(0).toUpperCase();
}

const MAX_HIGHLIGHTS = 3;

export default function ProductCards({ events }: { events: TradeEvent[] }) {
  const cards = latestCards(events);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!cards.length) return null;

  return (
    <div className="cards-wrap">
      <div className="cards-header">
        <strong>为你筛选的商品</strong>
        <span>
          {cards.length} 个候选 {selectedId ? "· 已选 1 个" : ""}
        </span>
      </div>
      <div className="cards">
        {cards.map((card, index) => {
          const isSelected = selectedId === card.product_id;
          return (
            <article
              key={card.product_id}
              className={`card${isSelected ? " is-selected" : ""}`}
              style={{ animationDelay: `${index * 80}ms` }}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedId(isSelected ? null : card.product_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId(isSelected ? null : card.product_id);
                }
              }}
            >
              <div className="card-thumb" aria-hidden="true">
                <span className="thumb-letter">{letterOf(card)}</span>
              </div>

              <header>
                <strong className="card-title">{card.title}</strong>
                <span className="brand">
                  {card.brand} · {card.origin_country}
                </span>
              </header>

              <div className="price">
                <span className="price-main">{card.price_major}</span>
                <small>{card.currency}</small>
              </div>

              {card.highlights.length > 0 && (
                <ul className="highlights">
                  {card.highlights.slice(0, MAX_HIGHLIGHTS).map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              )}

              <div className="skus">
                {card.skus.slice(0, 2).map((sku) => (
                  <span key={sku.sku_id} className="sku">
                    {sku.spec} · ¥{sku.price_major}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
