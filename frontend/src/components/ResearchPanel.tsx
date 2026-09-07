import { useMemo, useState, type CSSProperties } from "react";
import { getLatestProductHitsForCurrentTurn } from "../productData";
import type { ProductCard, TradeEvent } from "../types";

export type ResearchTab = "candidates" | "comparison";

interface ResearchPanelProps {
  events: TradeEvent[];
  activeTab: ResearchTab;
  onTabChange: (tab: ResearchTab) => void;
}

const TAB_LABELS: Array<{ key: ResearchTab; label: string }> = [
  { key: "candidates", label: "候选商品" },
  { key: "comparison", label: "参数对比" },
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
  const style: CSSProperties = {
    "--candidate-lowest": lowestPrice ? 1 : 0,
    "--candidate-rich": informationRich ? 1 : 0,
    "--candidate-selected": selected ? 1 : 0,
  } as CSSProperties;

  return (
    <article className="candidate-card" style={style}>
      <header className="candidate-head">
        <div>
          <p className="candidate-category">{card.category}</p>
          <h3>{card.title}</h3>
        </div>
        <span className="candidate-price">{formatPrice(card)}</span>
      </header>
      <ul className="candidate-highlights">
        {(card.highlights ?? []).slice(0, 3).map((highlight, index) => (
          <li key={index}>{highlight}</li>
        ))}
      </ul>
      <footer className="candidate-foot">
        <button type="button" onClick={onToggle} aria-pressed={selected}>
          {selected ? "取消对比" : "加入对比"}
        </button>
        <button type="button" onClick={onCompare}>查看对比</button>
      </footer>
    </article>
  );
}

function ComparisonView({ cards }: { cards: ProductCard[] }) {
  if (cards.length === 0) {
    return <p className="research-empty">请先从候选中选择最多 3 款商品进行对比。</p>;
  }

  const specs = ["title", "category", "price_major"];
  const labels: Record<string, string> = {
    title: "商品名称",
    category: "品类",
    price_major: "价格",
  };

  return (
    <section className="comparison-view" aria-label="参数对比">
      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col" />
            {cards.map((card) => (
              <th key={card.product_id} scope="col">
                {card.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {specs.map((spec) => (
            <tr key={spec}>
              <th scope="row">{labels[spec] ?? spec}</th>
              {cards.map((card) => (
                <td key={`${card.product_id}-${spec}`}>
                  {spec === "price_major" ? formatPrice(card) : String(card[spec as keyof ProductCard] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">库存概览</th>
            {cards.map((card) => (
              <td key={`${card.product_id}-stock`}>{stockSummary(card)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export default function ResearchPanel({ events, activeTab, onTabChange }: ResearchPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // 只获取当前 turn 的最新 product_search_tool hits，并限制为 Top 3
  const allCards = useMemo(() => getLatestProductHitsForCurrentTurn(events), [events]);
  const cards = useMemo(() => allCards.slice(0, 3), [allCards]);
  
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
              <p className="research-subtitle">优先比较这 {cards.length} 款</p>
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

      </div>
    </aside>
  );
}
