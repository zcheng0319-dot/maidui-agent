import type { TradeEvent } from "./types";

export interface WorkItem {
  id: number; label: string; detail: string;
  state: "running" | "done" | "error" | "stopped";
  time: number; duration?: number; tool?: string; startedAt?: string;
}
const labels: Record<string, string> = {
  category_insight_tool: "查阅品类选购知识", product_search_tool: "检索候选商品",
  web_search_tool: "搜索网上资料", remember_preference_tool: "记录购物偏好",
  forget_preference_tool: "移除购物偏好", create_order_tool: "创建订单",
  query_order_tool: "查询订单", cancel_order_tool: "取消订单", task_dispatch: "处理子任务",
};
export function formatElapsed(ms: number): string { return `${(Math.max(0, ms) / 1000).toFixed(1)} 秒`; }

/** Only pair results when their identity is unambiguous. */
export function deriveWorkProgress(events: TradeEvent[], active: boolean) {
  const items: WorkItem[] = [];
  let ended = false;
  for (const [id, event] of events.entries()) {
    const p = event.payload ?? {};
    const time = Date.parse(event.occurred_at);
    const add = (label: string, detail = "", state: WorkItem["state"] = "done") => {
      const item: WorkItem = { id, label, detail, state, time };
      items.push(item); return item;
    };
    if (event.type === "request.started") add("已提交需求", "等待买对开始处理");
    if (event.type === "agent.dispatch") Object.assign(
      add(p.agent === "trade_agent" ? "交易子任务" : "商品检索子任务", String(p.demands ?? ""), "running"),
      { tool: "task_dispatch", startedAt: p.started_at });
    if (event.type === "tool.invoke") {
      const args = p.args ?? {};
      const detail = [args.question ?? args.normalized_query ?? args.query, args.category,
        args.price_max_major != null ? `预算 ≤ ${args.price_max_major} ${args.target_currency ?? "元"}` : ""]
        .filter(Boolean).join(" · ");
      Object.assign(add(labels[p.tool] ?? "执行任务", detail, "running"), { tool: p.tool });
    }
    if (event.type === "tool.result") {
      if (p.harness && !p.error) continue;
      const pending = items.filter(item => item.tool === p.tool && item.state === "running");
      const matched = p.tool === "task_dispatch"
        ? pending.find(item => p.started_at && item.startedAt === p.started_at)
        : pending.length === 1 ? pending[0] : undefined;
      const state = p.error || p.circuit ? "error" : "done";
      const detail = p.error ? "执行失败，买对将根据可用信息继续处理"
        : p.hit_count != null ? `找到 ${p.hit_count} 条${p.tool === "category_insight_tool" ? "选购知识" : "结果"}` : "执行完成";
      const item = matched ?? add(labels[p.tool] ?? "任务结果", detail, state);
      item.state = state;
      item.detail = [matched?.detail, detail].filter(Boolean).join(" · ");
      if (typeof p.elapsed_ms === "number" && Number.isFinite(p.elapsed_ms)) item.duration = p.elapsed_ms;
      else if (matched && Number.isFinite(time - item.time)) item.duration = Math.max(0, time - item.time);
      // Concurrent calls without IDs are reported separately, never guessed.
      if (!matched && pending.length > 1) {
        item.tool = `${p.tool}:result`;
        if (items.filter(row => row.tool === item.tool).length >= pending.length)
          pending.forEach(row => { row.state = "stopped"; });
      }
    }
    if (event.type === "plan.update") for (const task of Array.isArray(p.tasks) ? p.tasks : []) {
      const key = `plan:${task.id ?? task.subject}`;
      let item = items.find(row => row.tool === key);
      if (!item) { item = add(String(task.subject ?? "任务计划")); item.tool = key; }
      item.state = /completed|done|success/i.test(String(task.state)) ? "done"
        : /fail|error/i.test(String(task.state)) ? "error" : "running";
    }
    if (event.type === "model.fallback") add("正在切换可用模型", "继续处理当前任务");
    if (event.type === "token.delta" && !items.some(item => item.tool === "reply"))
      Object.assign(add("正在生成回复", "回复内容实时显示在下方", "running"), { tool: "reply" });
    if (event.type === "final.result" || event.type === "error") {
      ended = true;
      items.forEach(item => { if (item.state === "running") item.state = item.tool === "reply" && event.type === "final.result" ? "done" : "stopped"; });
      add(event.type === "error" ? "本次处理失败" : "回复已完成", "", event.type === "error" ? "error" : "done");
    }
  }
  if (!active) items.forEach(item => { if (item.state === "running") item.state = "stopped"; });
  const running = items.filter(item => item.state === "running");
  const agents = running.filter(item => item.tool === "task_dispatch");
  const summary = agents.length > 1 ? `正在并行处理 ${agents.length} 个子任务`
    : running.length ? `正在${running[running.length - 1].label.replace(/^正在/, "")}`
    : active && !ended ? "正在分析需求，准备下一步" : "工作过程";
  return { items, summary, ended };
}
