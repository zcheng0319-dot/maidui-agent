import { useEffect, useMemo, useState } from "react";
import { deriveWorkProgress, formatElapsed } from "../workProgress";
import type { TradeEvent } from "../types";

export default function WorkTrace({ events, active = false }: { events: TradeEvent[]; active?: boolean }) {
  const [expanded, setExpanded] = useState(active);
  const [now, setNow] = useState(Date.now);
  const { items, summary, ended } = useMemo(() => deriveWorkProgress(events, active), [events, active]);
  const working = active && !ended;
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [working]);
  if (!items.length && !active) return null;
  const start = items.find(item => Number.isFinite(item.time))?.time;
  const finish = [...items].reverse().find(item => Number.isFinite(item.time))?.time;
  const elapsed = start === undefined ? null : (working ? now : finish ?? start) - start;
  return (
    <section className={`work-trace${working ? " is-active" : ""}`} aria-label="工作过程">
      <button type="button" className="work-trace-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <span className="work-trace-summary">
          {working && <span className="work-trace-working-dot" aria-hidden="true" />}{summary}
        </span>
        <span className="work-trace-meta">{elapsed !== null && formatElapsed(elapsed)} · {expanded ? "收起" : "展开"}</span>
      </button>
      {expanded && <ol className="work-trace-list">
        {items.map(item => <li key={`${item.id}-${item.tool ?? item.label}`} className={`work-trace-step is-${item.state}`}>
          <span className="work-trace-step-icon" aria-hidden="true" />
          <div className="work-trace-content">
            <div className="work-trace-title"><span>{item.label}</span><small>
              {item.state === "running" ? "进行中" : item.state === "error" ? "失败" : item.state === "stopped" ? "已结束" : "已完成"}
              {item.duration !== undefined ? ` · ${formatElapsed(item.duration)}` : ""}
            </small></div>
            {item.detail && <p>{item.detail}</p>}
          </div>
          <time className="work-trace-offset">{start !== undefined && Number.isFinite(item.time) ? `+${formatElapsed(item.time - start)}` : ""}</time>
        </li>)}
        {!items.length && working && <li>正在等待工作事件…</li>}
      </ol>}
    </section>
  );
}
