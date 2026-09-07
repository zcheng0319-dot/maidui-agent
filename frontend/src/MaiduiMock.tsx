import { useEffect, useState } from "react";

/**
 * 买对 · Agent UI 概念稿（STATIC MOCK）
 * - 完全 hard-coded，无后端、无 WebSocket、无状态机
 * - 一屏展示完整的"用户提交 → Agent 执行 → 工具 → 证据 → 比较 → 最终推荐"流程
 * - 设计目标：让人一眼觉得这是「真的在替我工作的 AI Agent」
 */

const PRIMARY_QUERY = "500 元以内，轻量、适合长距离徒步的登山杖";

const TASK_TAGS = ["预算 ≤ ¥500", "轻量优先", "长距离徒步", "可折叠"];

const WORKING_STEPS = [
  { id: 1, title: "理解需求", detail: "已识别预算、重量、使用场景", state: "done" },
  { id: 2, title: "搜索商品", detail: "找到 6 个相关候选", state: "done" },
  { id: 3, title: "查阅选购知识", detail: "已参考徒步装备选购规则", state: "running" },
  { id: 4, title: "对比候选", detail: "正在比较重量、材质、折叠尺寸", state: "pending" },
  { id: 5, title: "生成建议", detail: "即将完成", state: "pending" },
] as const;

const COMPARE_DIMS = ["重量", "折叠长度", "材质", "价格", "库存"];

const RULES = [
  "长距离徒步优先考虑单支重量与握把舒适性",
  "登山杖需区分单支重量和一对重量",
  "碳纤维材质对减重贡献最大但价格高 2–3 倍",
];

const CANDIDATES = [
  {
    tag: "性价比最高",
    name: "CascadePro",
    price: 199,
    over: false,
    pros: ["价格低", "7075 铝合金", "可折叠 38cm"],
    cons: ["重量信息缺失"],
  },
  {
    tag: "轻量首选",
    name: "TrekPole",
    price: 459,
    over: false,
    pros: ["单支 190g", "碳纤维", "EVA 握把"],
    cons: ["未标折叠长度"],
  },
  {
    tag: "性能最好",
    name: "CascadePro Titanium",
    price: 699,
    over: true,
    pros: ["单支 165g", "钛合金", "终身保修"],
    cons: ["超预算 ¥199"],
  },
] as const;

const TOOLS = [
  { name: "商品搜索", state: "done", count: "6 候选" },
  { name: "选购知识", state: "done", count: "3 参考" },
  { name: "参数比较", state: "active", count: "4 维度" },
  { name: "订单处理", state: "pending", count: "待执行" },
] as const;

export default function MaiduiMock() {
  // 极轻入场动画（仅视觉，让 Hero / Input / Working / Workspace 依次出现一次）
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={`mock ${mounted ? "is-in" : ""}`}>
      {/* ============ HERO（极简） ============ */}
      <header className="mock-hero">
        <div className="mock-brand">
          <div className="mock-logo" role="img" aria-label="买对">
            <img src="/logo-main.png" alt="" />
          </div>
          <div className="mock-brand-text">
            <h1>买对</h1>
            <p>AI 智能选购助手</p>
          </div>
          <p className="mock-tagline">帮你搜、比、选，最后买对。</p>
        </div>

        <div className="mock-agent-state">
          <span className="agent-orb" aria-hidden="true">
            <span className="agent-orb-core" />
          </span>
          <span className="agent-state-text">Agent Ready</span>
          <span className="agent-state-meta">v1.0 · 在线</span>
        </div>
      </header>

      {/* ============ Command Bar（核心输入） ============ */}
      <section className="mock-commandbar">
        <div className="mock-cmd">
          <span className="mock-cmd-sparkle" aria-hidden="true">✦</span>
          <input
            className="mock-cmd-input"
            readOnly
            value={PRIMARY_QUERY}
            aria-label="购物需求"
          />
          <button type="button" className="mock-cmd-submit">
            <span>让买对帮我选</span>
            <span className="mock-cmd-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        <div className="mock-cmd-chips">
          <span className="cmd-chip">预算</span>
          <span className="cmd-chip">使用场景</span>
          <span className="cmd-chip">核心偏好</span>
        </div>
      </section>

      {/* ============ Main 双栏（68% / 32%） ============ */}
      <main className="mock-main">
        <div className="mock-col-left">
          {/* 用户任务卡（极轻、几乎无卡片感） */}
          <section className="mock-task">
            <div className="mock-task-label">当前任务</div>
            <p className="mock-task-text">{PRIMARY_QUERY}</p>
            <div className="mock-task-tags">
              {TASK_TAGS.map((t) => (
                <span key={t} className="mock-task-tag">{t}</span>
              ))}
            </div>
          </section>

          {/* Agent Working（5 步执行 trace） */}
          <section className="mock-working">
            <div className="mock-section-head">
              <h2>买对正在执行任务</h2>
              <span className="mock-section-meta">Step 3 / 5</span>
            </div>
            <ol className="mock-steps">
              {WORKING_STEPS.map((s, i) => (
                <li key={s.id} className={`mock-step is-${s.state}`} style={{ animationDelay: `${i * 90}ms` }}>
                  <span className="mock-step-marker" aria-hidden="true">
                    {s.state === "done" && "✓"}
                    {s.state === "running" && <span className="step-pulse" />}
                    {s.state === "pending" && "○"}
                  </span>
                  <div className="mock-step-body">
                    <div className="mock-step-no">{String(s.id).padStart(2, "0")}</div>
                    <div className="mock-step-title">{s.title}</div>
                    <div className="mock-step-detail">{s.detail}</div>
                  </div>
                  <span className={`mock-step-badge badge-${s.state}`}>
                    {s.state === "done" && "Completed"}
                    {s.state === "running" && "Running"}
                    {s.state === "pending" && "Pending"}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* 决策依据 + 参考规则 */}
          <section className="mock-evidence">
            <div className="mock-section-head">
              <h3>决策依据</h3>
              <span className="mock-section-meta">Evidence-based</span>
            </div>
            <p className="mock-evidence-hint">当前主要比较：</p>
            <div className="mock-evidence-chips">
              {COMPARE_DIMS.map((d) => (
                <span key={d} className="evidence-chip">{d}</span>
              ))}
            </div>
            <div className="mock-rules">
              <div className="mock-rules-title">参考规则</div>
              <ul>
                {RULES.map((r) => (
                  <li key={r}>
                    <span className="rule-marker" aria-hidden="true">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 候选商品（3 张主卡） */}
          <section className="mock-candidates">
            <div className="mock-section-head">
              <h2>候选商品</h2>
              <span className="mock-section-meta">Agent 已筛出 3 款最值得比较的商品</span>
            </div>
            <div className="mock-candidate-grid">
              {CANDIDATES.map((c, i) => (
                <article key={c.name} className={`mock-card ${c.over ? "is-over" : ""}`} style={{ animationDelay: `${i * 110}ms` }}>
                  <header className="mock-card-head">
                    <span className="mock-card-label">候选 {String.fromCharCode(65 + i)}</span>
                    <span className="mock-card-tag">{c.tag}</span>
                  </header>
                  <h3 className="mock-card-name">{c.name}</h3>
                  <div className="mock-card-price">
                    <span className="currency">¥</span>
                    <span className="amount">{c.price}</span>
                    {c.over && <span className="over-budget">+¥{c.price - 500}</span>}
                  </div>
                  <ul className="mock-card-pros">
                    {c.pros.map((p) => (
                      <li key={p}>
                        <span className="pros-marker" aria-hidden="true">+</span>{p}
                      </li>
                    ))}
                  </ul>
                  <ul className="mock-card-cons">
                    {c.cons.map((p) => (
                      <li key={p}>
                        <span className="cons-marker" aria-hidden="true">−</span>{p}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          {/* 最终建议（tinted surface） */}
          <section className="mock-final">
            <div className="mock-final-label">买对建议</div>
            <h2 className="mock-final-title">推荐 TrekPole 碳纤维登山杖</h2>
            <p className="mock-final-reason">
              更符合「长距离徒步 + 轻量优先」的双重约束。
              虽然不是最便宜，但已知重量信息最完整，
              实际徒步中单支 190g 的体感比 CascadePro 的「重量未知」更值得信赖。
            </p>
            <div className="mock-final-cta">
              <button type="button" className="btn-primary">选这款</button>
              <button type="button" className="btn-ghost">继续比较</button>
            </div>
          </section>
        </div>

        {/* ============ 右侧 Agent Workspace（32%） ============ */}
        <aside className="mock-workspace">
          <header className="workspace-head">
            <div>
              <h2>Agent Workspace</h2>
              <p>买对 · 执行过程</p>
            </div>
            <span className="workspace-session">Session 7f3a91</span>
          </header>

          <section className="workspace-block">
            <div className="ws-title">
              <span className="ws-dot" />PLAN
            </div>
            <div className="ws-understand">
              <div className="ws-row"><span>预算</span><b>500 元</b></div>
              <div className="ws-row"><span>用途</span><b>长距离徒步</b></div>
              <div className="ws-row"><span>偏好</span><b>轻量</b></div>
              <div className="ws-row"><span>附加</span><b>可折叠</b></div>
            </div>
          </section>

          <section className="workspace-block">
            <div className="ws-title">
              <span className="ws-dot" />TOOLS
            </div>
            <div className="ws-tools">
              {TOOLS.map((t) => (
                <div key={t.name} className={`ws-tool is-${t.state}`}>
                  <span className="ws-tool-name">{t.name}</span>
                  <span className="ws-tool-count">{t.count}</span>
                  <span className="ws-tool-state">
                    {t.state === "done" && "✓"}
                    {t.state === "active" && <span className="step-pulse small" />}
                    {t.state === "pending" && "○"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="workspace-block">
            <div className="ws-title">
              <span className="ws-dot" />EVIDENCE
            </div>
            <ul className="ws-evidence">
              <li>
                <div className="ws-evi-title">候选数</div>
                <div className="ws-evi-value">6</div>
              </li>
              <li>
                <div className="ws-evi-title">比较维度</div>
                <div className="ws-evi-value">4</div>
              </li>
              <li>
                <div className="ws-evi-title">知识引用</div>
                <div className="ws-evi-value">3</div>
              </li>
              <li>
                <div className="ws-evi-title">置信度</div>
                <div className="ws-evi-value">0.86</div>
              </li>
            </ul>
          </section>

          <section className="workspace-block">
            <div className="ws-title">
              <span className="ws-dot" />STATUS
            </div>
            <div className="ws-status">
              <span className="ws-status-pulse" aria-hidden="true" />
              正在生成推荐
            </div>
            <div className="ws-foot">预计 4s 后完成</div>
          </section>
        </aside>
      </main>

      <footer className="mock-footer">
        <span>STATIC DESIGN MOCK · 不接真实系统</span>
        <span>买对 · AI 智能选购助手</span>
      </footer>
    </div>
  );
}
