import { useMemo, useState, type CSSProperties } from "react";
import { extractKnownSpecs, latestCards, latestFinalText } from "../productData";
import type { ProductCard, TradeEvent } from "../types";

export type ResearchTab = "candidates" | "comparison" | "recommendation";

interface ResearchPanelProps {
  events: TradeEvent[];
  activeTab: ResearchTab;
  onTabChange: (tab: ResearchTab) => void;
}

const TAB_LABELS: Array<{ key: ResearchTab; label: string }> = [
  { key: "candidates", label: "候选商品" },
  { key: "comparison", label: "参数对比" },
  { key: "recommendation", label: "买对建议" },
];

function formatPrice(card: ProductCard): string {
  return `${card.currency} ${card.price_major}`;
}

function stockSummary(card: ProductCard): string {
  if (!card.skus?.length) return "未知";
  return card.skus.map((sku) => `${sku.spec}：${sku.stock}`).join("；");
}

function isProductSearchActive(events: TradeEvent[]): boolean {
  let start = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === "final.result") {
      start = index + 1;
      break;
    }
  }
  const current = events.slice(start);
  const invokes = current.filter((event) => event.type === "tool.invoke" && /product_search_tool/i.test(String(event.payload?.tool ?? ""))).length;
  const results = current.filter((event) => event.type === "tool.result" && /product_search_tool/i.test(String(event.payload?.tool ?? ""))).length;
  return invokes > results;
}

function CandidateCard({
  card,
  lowestPrice,
  informationRich,
  selected,
  onToggle,
  onCompare,
}: {
  card: ProductCard;
  lowestPrice: boolean;
  informationRich: boolean;
  selected: boolean;
  onToggle: () => void;
  onCompare: () => void;
}) {
  const highlights = card.highlights?.slice(0, 3) ?? [];
  return (
    <article className="candidate-card">
      <div className="candidate-image" aria-hidden="true">{(card.title || card.brand || "?").trim().charAt(0)}</div>
      <div className="candidate-meta">
        <p className="candidate-brand">{card.brand || "未知品牌"}</p>
        <h3>{card.title || "未命名商品"}</h3>
        <p className="candidate-price">{formatPrice(card)}</p>
        <div className="candidate-tags">
          {lowestPrice && <span>最低价格</span>}
          {informationRich && <span>信息较完整</span>}
          {card.category && <span>{card.category}</span>}
        </div>
        {highlights.length > 0 && (
          <ul className="candidate-highlights">
            {highlights.map((highlight, index) => <li key={`${highlight}-${index}`}>{highlight}</li>)}
          </ul>
        )}
        {card.skus?.length > 0 && <p className="candidate-skus">{stockSummary(card)}</p>}
        <div className="candidate-actions">
          <button type="button" onClick={onToggle}>{selected ? "移出对比" : "加入对比"}</button>
          <button type="button" onClick={onCompare}>查看参数</button>
        </div>
      </div>
    </article>
  );
}

function ComparisonView({ cards }: { cards: ProductCard[] }) {
  if (cards.length === 0) return <p className="research-empty">找到多个候选后，可以在这里对比参数。</p>;

  const rows = [
    { label: "价格", values: cards.map(formatPrice) },
    { label: "品牌", values: cards.map((card) => card.brand || "未知") },
    { label: "品类", values: cards.map((card) => card.category || "未知") },
    { label: "库存", values: cards.map(stockSummary) },
    { label: "产地", values: cards.map((card) => card.origin_country || "未知") },
    { label: "重量", values: cards.map((card) => extractKnownSpecs(card).weight ?? "未知") },
    { label: "材质", values: cards.map((card) => extractKnownSpecs(card).material ?? "未知") },
    { label: "折叠长度", values: cards.map((card) => extractKnownSpecs(card).foldedLength ?? "未知") },
  ];

  return (
    <div
      className="comparison-grid"
      role="table"
      aria-label="候选商品参数对比"
      style={{ "--comparison-columns": cards.length } as CSSProperties}
    >
      <div className="comparison-row comparison-header" role="row">
        <div className="comparison-cell" role="columnheader">参数</div>
        {cards.map((card) => <div className="comparison-cell" role="columnheader" key={card.product_id}>{card.title || "未命名商品"}</div>)}
      </div>
      {rows.map((row) => (
        <div className="comparison-row" role="row" key={row.label}>
          <div className="comparison-cell comparison-label" role="rowheader">{row.label}</div>
          {row.values.map((value, index) => <div className="comparison-cell" role="cell" key={`${row.label}-${index}`}>{value}</div>)}
        </div>
      ))}
    </div>
  );
}

export default function ResearchPanel({ events, activeTab, onTabChange }: ResearchPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const cards = useMemo(() => latestCards(events), [events]);
  const finalText = useMemo(() => latestFinalText(events), [events]);
  const searching = isProductSearchActive(events);
  const lowestPrice = cards.length > 1 ? Math.min(...cards.map((card) => card.price_major)) : null;
  const richestHighlights = Math.max(0, ...cards.map((card) => card.highlights?.length ?? 0));
  const comparisonCards = selectedIds.length > 0
    ? cards.filter((card) => selectedIds.includes(card.product_id)).slice(0, 3)
    : cards.slice(0, 3);

  const toggleComparison = (id: string) => {
    setSelectedIds((previous) => previous.includes(id)
      ? previous.filter((value) => value !== id)
      : [...previous, id].slice(-3));
  };

  return (
    <aside className="research-panel" aria-label="商品研究工作区">
      <header className="research-heading">
        <div>
          <p>商品研究</p>
          <h2>{TAB_LABELS.find((tab) => tab.key === activeTab)?.label}</h2>
        </div>
      </header>
      <nav className="research-tabs" aria-label="商品研究标签页">
        {TAB_LABELS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`research-tab${activeTab === tab.key ? " is-active" : ""}`}
            aria-current={activeTab === tab.key ? "page" : undefined}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="research-content">
        {activeTab === "candidates" && (
          cards.length > 0 ? (
            <>
              <p className="research-subtitle">买对为你找到的相关候选</p>
              <div className="candidate-list">
                {cards.map((card) => (
                  <CandidateCard
                    key={card.product_id}
                    card={card}
                    lowestPrice={lowestPrice !== null && card.price_major === lowestPrice}
                    informationRich={richestHighlights > 0 && (card.highlights?.length ?? 0) === richestHighlights}
                    selected={selectedIds.includes(card.product_id)}
                    onToggle={() => toggleComparison(card.product_id)}
                    onCompare={() => onTabChange("comparison")}
                  />
                ))}
              </div>
            </>
          ) : searching ? <p className="research-empty is-loading">正在检索商品…</p> : <p className="research-empty">还没有商品候选。</p>
        )}

        {activeTab === "comparison" && <ComparisonView cards={comparisonCards} />}

        {activeTab === "recommendation" && (
          finalText ? (
            <article className="recommendation-view">
              <p className="recommendation-kicker">买对建议</p>
              <div className="recommendation-text">{finalText}</div>
              <div className="recommendation-actions">
                {cards.length > 0 && <button type="button" onClick={() => onTabChange("candidates")}>查看候选商品</button>}
                {cards.length >= 2 && <button type="button" onClick={() => onTabChange("comparison")}>查看参数对比</button>}
              </div>
            </article>
          ) : <p className="research-empty">买对完成分析后，会在这里整理推荐结论。</p>
        )}
      </div>
    </aside>
  );
}
