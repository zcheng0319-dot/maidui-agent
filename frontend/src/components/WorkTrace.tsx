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

export default function WorkTrace({ events, active = false }: WorkTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const { steps } = useMemo(() => deriveSteps(events), [events]);
  const visibleSteps = steps.filter((step) => step.log.length > 0);
  const duration = useMemo(() => durationFor(events), [events]);

  if (visibleSteps.length === 0 && !active) return null;

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
          {visibleSteps.map((step) => (
            <li key={step.key} className={`work-trace-step is-${step.state}`}>
              <span className="work-trace-step-icon" aria-hidden="true" />
              <span>{step.label}</span>
              {step.state === "running" && <small>进行中</small>}
            </li>
          ))}
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
