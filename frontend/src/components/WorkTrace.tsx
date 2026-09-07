import { useMemo, useState } from "react";
import { deriveSteps } from "../agentSteps";
import type { TradeEvent } from "../types";

interface WorkTraceProps {
  events: TradeEvent[];
  active?: boolean;
}

function durationFor(events: TradeEvent[]): number | null {
  const reported = events
    .filter((event) => event.type === "tool.result")
    .map((event) => Number(event.payload?.elapsed_ms))
    .filter((value) => Number.isFinite(value) && value >= 0);

  // Tool results are the backend's explicit duration values.  When several
  // sequential tools report a duration, their total is the only duration we
  // display rather than inventing a wall-clock estimate.
  if (reported.length > 0) return reported.reduce((sum, value) => sum + value, 0);

  const timestamps = events
    .map((event) => Date.parse(event.occurred_at))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length < 2) return null;

  const elapsed = Math.max(...timestamps) - Math.min(...timestamps);
  return elapsed >= 0 ? elapsed : null;
}

function durationLabel(milliseconds: number): string {
  if (milliseconds < 1000) return "用时 <1 秒";
  return `工作了 ${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} 秒`;
}

/** 格式化单个事件的详细信息 */
function formatEventDetail(event: TradeEvent): React.ReactNode {
  const p = event.payload ?? {};
  
  switch (event.type) {
    case "agent.dispatch":
      return (
        <div className="event-detail">
          <div className="event-type">🤖 Agent 调度</div>
          <div className="event-content">
            <strong>Agent:</strong> {p.agent}<br/>
            <strong>需求:</strong> {String(p.demands ?? "").slice(0, 100)}
          </div>
        </div>
      );
    
    case "tool.invoke":
      return (
        <div className="event-detail">
          <div className="event-type">🔧 调用工具</div>
          <div className="event-content">
            <strong>工具名:</strong> {p.tool}<br/>
            <strong>参数:</strong> <pre>{JSON.stringify(p.args ?? {}, null, 2)}</pre>
          </div>
        </div>
      );
    
    case "tool.result":
      if (p.error || p.circuit) {
        return (
          <div className="event-detail event-error">
            <div className="event-type">❌ 工具失败</div>
            <div className="event-content">
              <strong>工具名:</strong> {p.tool}<br/>
              <strong>错误:</strong> {p.error || p.circuit}<br/>
              {p.elapsed_ms && <><strong>耗时:</strong> {p.elapsed_ms}ms</>}
            </div>
          </div>
        );
      }
      
      // 对于 product_search_tool，显示 hits 摘要
      if (p.tool === "product_search_tool" && Array.isArray(p.hits)) {
        return (
          <div className="event-detail">
            <div className="event-type">✅ 搜索结果</div>
            <div className="event-content">
              <strong>工具名:</strong> {p.tool}<br/>
              <strong>命中数:</strong> {p.hit_count ?? p.hits.length}<br/>
              {p.elapsed_ms && <><strong>耗时:</strong> {p.elapsed_ms}ms</>}
              {p.query && <><strong>查询:</strong> {p.query}</>}
              {p.category && <><strong>品类:</strong> {p.category}</>}
              {p.price_max && <><strong>价格上限:</strong> ¥{p.price_max}</>}
              
              {/* 显示前3个商品的简要信息 */}
              {p.hits.length > 0 && (
                <div className="event-hits-preview">
                  <strong>返回商品（前3个）:</strong>
                  <ul>
                    {p.hits.slice(0, 3).map((hit: any, idx: number) => (
                      <li key={idx}>
                        [{hit.category}] {hit.title} — ¥{hit.price}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      }
      
      // 其他工具结果
      return (
        <div className="event-detail">
          <div className="event-type">✅ 工具返回</div>
          <div className="event-content">
            <strong>工具名:</strong> {p.tool}<br/>
            {p.elapsed_ms && <><strong>耗时:</strong> {p.elapsed_ms}ms</>}
            {p.hit_count !== undefined && <><strong>命中:</strong> {p.hit_count} 条</>}
            {p.order && <><strong>订单:</strong> {p.order.order_id} ({p.order.status})</>}
            {p.saved && <><strong>已保存:</strong> {p.saved}</>}
          </div>
        </div>
      );
    
    case "final.result":
      return (
        <div className="event-detail">
          <div className="event-type">📝 最终回复</div>
          <div className="event-content">
            <strong>长度:</strong> {String(p.text ?? "").length} 字符<br/>
            <details>
              <summary>查看完整内容</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{p.text}</pre>
            </details>
          </div>
        </div>
      );
    
    case "model.fallback":
      return (
        <div className="event-detail event-warning">
          <div className="event-type">⚠️ 模型回退</div>
          <div className="event-content">
            <strong>从:</strong> {p.from} → <strong>到:</strong> {p.to}<br/>
            <strong>原因:</strong> {p.reason}
          </div>
        </div>
      );
    
    case "error":
      return (
        <div className="event-detail event-error">
          <div className="event-type">💥 错误</div>
          <div className="event-content">
            <strong>消息:</strong> {p.message}
          </div>
        </div>
      );
    
    default:
      return (
        <div className="event-detail">
          <div className="event-type">📄 {event.type}</div>
          <div className="event-content">
            <pre style={{ fontSize: '11px' }}>{JSON.stringify(p, null, 2)}</pre>
          </div>
        </div>
      );
  }
}

export default function WorkTrace({ events, active = false }: WorkTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedStepKeys, setExpandedStepKeys] = useState<Set<string>>(new Set());
  const { steps } = useMemo(() => deriveSteps(events), [events]);
  const visibleSteps = steps.filter((step) => step.log.length > 0);
  const duration = useMemo(() => durationFor(events), [events]);

  if (visibleSteps.length === 0 && !active) return null;

  const toggleStepExpand = (stepKey: string) => {
    setExpandedStepKeys((prev) => {
      const next = new Set(prev);
      if (next.has(stepKey)) {
        next.delete(stepKey);
      } else {
        next.add(stepKey);
      }
      return next;
    });
  };

  return (
    <section className={`work-trace${active ? " is-active" : ""}`} aria-label="工作过程">
      <button
        type="button"
        className="work-trace-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="work-trace-summary">
          {active && <span className="work-trace-working-dot" aria-hidden="true" />}
          {active ? "买对正在分析" : duration === null ? "查看工作过程" : durationLabel(duration)}
        </span>
        <span aria-hidden="true">{expanded ? "收起" : "展开"}⌄</span>
      </button>

      {expanded && (
        <ol className="work-trace-list">
          {visibleSteps.map((step) => {
            const isStepExpanded = expandedStepKeys.has(step.key);
            
            return (
              <li key={step.key} className={`work-trace-step is-${step.state}`}>
                <div 
                  className="work-trace-step-header"
                  onClick={() => toggleStepExpand(step.key)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="work-trace-step-icon" aria-hidden="true" />
                  <span className="work-trace-step-label">{step.label}</span>
                  {step.state === "running" && <small className="work-trace-step-status">进行中</small>}
                  {step.state === "done" && <small className="work-trace-step-status">✓</small>}
                  {step.state === "error" && <small className="work-trace-step-status">✗</small>}
                  <span className="work-trace-step-expand-indicator">
                    {isStepExpanded ? "▲" : "▼"}
                  </span>
                </div>
                
                {/* 展开的事件详情 */}
                {isStepExpanded && step.log.length > 0 && (
                  <div className="work-trace-step-events">
                    {step.log.map((event, idx) => (
                      <div key={`${step.key}-${idx}`} className="work-trace-event-item">
                        {formatEventDetail(event)}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
          
          {visibleSteps.length === 0 && active && (
            <li className="work-trace-step is-running">
              <span className="work-trace-step-icon" aria-hidden="true" />
              <span>正在等待工作事件</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
