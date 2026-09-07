import { useEffect, useRef, useState } from "react";
import { STEP_DEFS, deriveSteps, summarizeEvent, type AgentStepRuntime } from "../agentSteps";
import type { TradeEvent } from "../types";

/**
 * 右侧「AI 决策过程」面板。
 * 面板不再展示原始日志，而是把真实事件映射成 5 个可读步骤：
 *   理解需求 → 检索商品 → 查阅选购知识 → 比较候选 → 整理推荐
 * 每一步：running=pulse dot / done=check / error=warning。
 * 技术信息（真实底层 event）收进可折叠的次级区域，普通用户可忽略。
 */
export default function AgentPanel({ events }: { events: TradeEvent[] }) {
  const [steps, setSteps] = useState<AgentStepRuntime[]>(() =>
    STEP_DEFS.map((d) => ({ ...d, state: "idle" as const, log: [], active: false })),
  );
  const [open, setOpen] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    setSteps(deriveSteps(events).steps);
  }, [events]);

  const activeCount = steps.filter((s) => s.state === "running").length;
  const doneCount = steps.filter((s) => s.state === "done").length;
  const allDone = doneCount === steps.length;

  return (
    <aside className="agent-panel">
      <div className="panel-head">
        <div>
          <h2>AI 决策过程</h2>
          <p className="panel-sub">买对正在为你工作</p>
        </div>
        {activeCount > 0 && (
          <span className="panel-badge" role="status" aria-live="polite">
            <span className="badge-dot" />
            进行中
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <p className="panel-empty">
          发送一条购物意图后，这里会一步一步展示买对 Agent 在做什么。
        </p>
      ) : (
        <ol className="steps" ref={listRef}>
          {steps.map((step, index) => {
            const expandable = step.log.length > 0;
            const isOpen = open === index;
            return (
              <li
                key={step.key}
                className={`step ${step.state}${step.active ? " is-active" : ""}`}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="step-row">
                  <span className="step-dot" aria-hidden="true" />
                  <span className="step-label">{step.label}</span>
                  <span className="step-hint">{step.hint}</span>
                  {expandable && (
                    <button
                      type="button"
                      className="step-toggle"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : index)}
                    >
                      {isOpen ? "收起" : "详情"}
                    </button>
                  )}
                </div>
                {isOpen && (
                  <ul className="step-log">
                    {step.log.map((event, i) => (
                      <li key={`${event.occurred_at}-${i}`}>{summarizeEvent(event)}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {doneCount > 0 && (
        <footer className="panel-foot">
          已完成 {doneCount}/{steps.length} 步{allDone && activeCount === 0 ? " · 推荐已就绪" : ""}
        </footer>
      )}
    </aside>
  );
}
