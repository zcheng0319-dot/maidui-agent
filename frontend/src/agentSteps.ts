import type { TradeEvent } from "./types";

/** Agent 工作阶段（5 个可读 step）。只用于把真实事件映射成人和产品都能看懂的进度。 */
export type StepKey = "understand" | "search" | "insight" | "compare" | "recommend";
export type StepState = "idle" | "running" | "done" | "error";

export interface AgentStepDef {
  key: StepKey;
  label: string;
  hint: string;
}

export interface AgentStepRuntime extends AgentStepDef {
  state: StepState;
  /** 该步骤触发的真实底层事件（技术信息，供折叠查看）。 */
  log: TradeEvent[];
  /** 是否为当前正在进行的步骤（用于左侧 Thinking 联动）。 */
  active: boolean;
}

export const STEP_DEFS: AgentStepDef[] = [
  { key: "understand", label: "理解需求", hint: "读懂你的购物意图与预算" },
  { key: "search", label: "检索商品", hint: "从商品库中筛选候选" },
  { key: "insight", label: "查阅选购知识", hint: "结合品类选购常识分析" },
  { key: "compare", label: "比较候选", hint: "对比参数与到手价" },
  { key: "recommend", label: "整理推荐", hint: "汇总并给出购买建议" },
];

/** 把真实 tool 名归到对应 step。 */
function stepKeyForTool(tool: string): StepKey | null {
  const t = String(tool ?? "").toLowerCase();
  if (/product_search|search|web_search/.test(t)) return "search";
  if (/category_insight|insight|knowledge|rag/.test(t)) return "insight";
  if (/create_order|query_order|cancel_order|order/.test(t)) return "compare";
  if (/remember_preference|forget_preference|task_dispatch|preference/.test(t)) return "understand";
  return null;
}

function stepKeyForEvent(event: TradeEvent): StepKey | null {
  switch (event.type) {
    case "agent.dispatch":
    case "plan.update":
    case "context.compressed":
      return "understand";
    case "tool.invoke":
    case "tool.result":
      return stepKeyForTool(event.payload?.tool ?? "");
    case "final.result":
      return "recommend";
    default:
      return null;
  }
}

function hasError(event: TradeEvent): boolean {
  const p = event.payload ?? {};
  return Boolean(p.error || p.circuit);
}

/** 一条事件的用户可读摘要（技术信息折叠区，压缩底层 JSON）。 */
export function summarizeEvent(event: TradeEvent): string {
  const p = event.payload ?? {};
  switch (event.type) {
    case "agent.dispatch":
      return `${p.agent}：${String(p.demands ?? "").slice(0, 60)}`;
    case "tool.invoke":
      return `调用 ${p.tool}（${JSON.stringify(p.args ?? {}).slice(0, 60)}）`;
    case "tool.result": {
      if (p.circuit) return `${p.tool} 熔断状态 ${p.circuit}：${p.error ?? ""}`;
      if (p.error) return `${p.tool} 失败：${p.error}`;
      if (p.elapsed_ms !== undefined) return `${p.tool}（${p.agent ?? ""}）耗时 ${p.elapsed_ms}ms`;
      if (p.hit_count !== undefined) {
        const strategy = p.recall_strategy ? ` / ${p.recall_strategy}` : "";
        return `${p.tool} 命中 ${p.hit_count} 条${strategy}`;
      }
      if (p.order) return `${p.tool} → 订单 ${p.order.order_id} ${p.order.status}`;
      if (p.saved) return `${p.tool} 已记住：${p.saved}`;
      return String(p.tool ?? "");
    }
    case "plan.update":
      return (p.tasks ?? [])
        .map((task: any) => `${task.subject}[${task.state}]`)
        .join(" · ");
    case "context.compressed":
      return `摘要 ${p.summary_length} 字，压缩后上下文 ${p.context_messages} 条`;
    case "model.fallback":
      return `${p.from} 限流，已改用 ${p.to}（${String(p.reason ?? "").slice(0, 40)}）`;
    case "final.result":
      return String(p.text ?? "").slice(0, 80);
    case "error":
      return String(p.message ?? "");
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}

/** 真实事件 → 5 步运行时状态。全程只读事件，不改任何业务/协议。 */
export function deriveSteps(events: TradeEvent[]): {
  steps: AgentStepRuntime[];
  activeMapping: Record<StepKey, string>;
} {
  // 每个 step 的状态，从 idle 起步
  const states: Record<StepKey, StepState> = {
    understand: "idle",
    search: "idle",
    insight: "idle",
    compare: "idle",
    recommend: "idle",
  };
  const logs: Record<StepKey, TradeEvent[]> = {
    understand: [],
    search: [],
    insight: [],
    compare: [],
    recommend: [],
  };

  let finalized = false;
  for (const event of events) {
    const sk = stepKeyForEvent(event);
    if (!sk) continue;
    logs[sk].push(event);

    if (finalized) {
      // final.result 之后不再改变状态细节
      if (states[sk] === "idle") states[sk] = "done";
      continue;
    }

    if (event.type === "tool.invoke") {
      states[sk] = "running";
    } else if (event.type === "tool.result") {
      states[sk] = hasError(event) ? "error" : "done";
    } else if (event.type === "final.result") {
      // 收尾：所有已关联 step 置为完成
      for (const k of Object.keys(states) as StepKey[]) {
        if (states[k] !== "idle") states[k] = "done";
        else states[k] = "done";
      }
      finalized = true;
    } else {
      // agent.dispatch / plan.update / context.compressed —— 表达「理解需求」已在进行/推进
      states[sk] = "done";
    }
  }

  // 同一轮只认最晚出现的 running 为真正 running；被更晚步骤超越的 running 视为已完成
  const order: StepKey[] = ["understand", "search", "insight", "compare", "recommend"];
  let lastRunning = -1;
  order.forEach((k, i) => {
    if (states[k] === "running") lastRunning = i;
  });
  if (lastRunning >= 0) {
    order.forEach((k, i) => {
      if (states[k] === "running" && i < lastRunning) states[k] = "done";
    });
  }

  const steps: AgentStepRuntime[] = STEP_DEFS.map((def) => {
    const state = states[def.key];
    const active = state === "running";
    return { ...def, state, log: logs[def.key], active };
  });

  const activeMapping: Record<StepKey, string> = {
    understand: "正在理解你的需求",
    search: "正在从商品库中筛选候选",
    insight: "正在结合品类选购知识分析",
    compare: "正在比较候选参数与到手价",
    recommend: "正在汇总并整理推荐",
  };

  return { steps, activeMapping };
}

/** 左侧 Thinking 卡片的文案：优先绑定真实活跃 step，否则返回 null（由调用方给兜底轮播文案）。 */
export function currentThinkingText(events: TradeEvent[]): string | null {
  const { steps, activeMapping } = deriveSteps(events);
  const active = steps.find((s) => s.state === "running");
  return active ? activeMapping[active.key] : null;
}

/**
 * Return the real event slice owned by one completed agent response.
 * `final.result` is the existing stream boundary: events after the previous
 * final result through this one belong to the same response.  This is a UI
 * grouping helper only; it neither changes nor supplements event data.
 */
export function getEventsForAgentTurn(
  events: TradeEvent[],
  finalEventIndex: number,
): TradeEvent[] {
  if (finalEventIndex < 0 || finalEventIndex >= events.length) return [];

  let start = 0;
  for (let index = finalEventIndex - 1; index >= 0; index -= 1) {
    if (events[index].type === "final.result") {
      start = index + 1;
      break;
    }
  }
  return events.slice(start, finalEventIndex + 1);
}

/** Events since the most recent completed response, for the live stream. */
export function getEventsForActiveAgentTurn(events: TradeEvent[]): TradeEvent[] {
  let start = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === "final.result") {
      start = index + 1;
      break;
    }
  }
  return events.slice(start);
}
