# -*- coding: utf-8 -*-
"""product_search_tool

商品检索工具：结构化检索入参 → CatalogSearchUseCase → 商品卡 JSON。
MainAgent 单干与 SearchAgent 派发两条路径共用同一工具实例。
工厂模式注入 UseCase 与 EventBus，模型看到的只是工具入参与返回值结构。

注意：本模块不能用 `from __future__ import annotations`——
AgentScope 用 pydantic 从函数签名动态生成 JSON schema，字符串化注解会解析失败。
"""
import json
from typing import Optional

from agentscope.message import TextBlock, ToolResultState
from agentscope.tool import ToolChunk

from app.application.usecases.catalog_search import CatalogSearchUseCase
from app.domain.catalog.product_search_spec import ProductSearchSpec
from app.infrastructure.context import ShoppingContext
from app.infrastructure.eventbus import TradeEventBus


def build_product_search_tool(usecase: CatalogSearchUseCase, bus: TradeEventBus):
    async def product_search_tool(
        normalized_query: str,
        category: Optional[str] = None,
        ship_to: Optional[str] = None,
        top_k: int | str = 5,
        price_max_major: float | str | None = None,
        target_currency: str = "CNY",
    ) -> ToolChunk:
        """检索商品库（embedding+rerank 二阶段召回），返回 Top-K 商品卡 JSON。
        商品价格、库存和参数以返回结果为准，无需自行估算。

        Args:
            normalized_query (`str`):
                标准化检索词，保留品类词与关键属性词（如"旅行三件套 抗造 轻便 无塑料"）。
            category (`str | None`):
                品类槽位，可选，如"旅行装备"、"数码配件"。
            ship_to (`str | None`):
                兼容既有检索链路的内部参数；普通商品推荐无需传入。
            top_k (`int`):
                返回候选数量，默认 5。
            price_max_major (`float | None`):
                价格上限（target_currency 主单位），买家有预算硬约束时必传，由检索链路结构化过滤。
            target_currency (`str`):
                价格展示币种，默认 "CNY"。
        """
        # 模型有时会把数字参数当字符串传（实测 qwen3-max 传 "300"），
        # schema 层放宽为接受数字字符串，这里统一强转后再进检索链路。
        if isinstance(top_k, str):
            try:
                top_k = int(top_k)
            except ValueError:
                return ToolChunk(
                    content=[TextBlock(type="text", text=f"[error] top_k 非法：{top_k}")],
                    state=ToolResultState.ERROR,
                )
        if isinstance(price_max_major, str):
            try:
                price_max_major = float(price_max_major)
            except ValueError:
                return ToolChunk(
                    content=[TextBlock(type="text", text=f"[error] price_max_major 非法：{price_max_major}")],
                    state=ToolResultState.ERROR,
                )
        session_id = ShoppingContext.current_session_id()
        args = {
            "normalized_query": normalized_query,
            "category": category,
            "ship_to": ship_to,
            "top_k": top_k,
            "price_max_major": price_max_major,
            "target_currency": target_currency,
        }
        bus.publish(session_id, "tool.invoke", {"tool": "product_search_tool", "args": args})
        try:
            spec = ProductSearchSpec(
                normalized_query=normalized_query,
                category=category,
                ship_to=ship_to,
                top_k=top_k,
                price_max_major=price_max_major,
                target_currency=target_currency,
            )
            result = await usecase.execute(spec)
        except ValueError as err:
            bus.publish(session_id, "tool.result", {"tool": "product_search_tool", "error": str(err)})
            return ToolChunk(
                content=[TextBlock(type="text", text=f"[error] {err}")],
                state=ToolResultState.ERROR,
            )
        bus.publish(
            session_id,
            "tool.result",
            {
                "tool": "product_search_tool",
                "hit_count": len(result["hits"]),
                "recall_strategy": result["recall_strategy"],
                # 商品卡随事件下发，前端无需再调接口即可渲染。
                "hits": result["hits"],
            },
        )
        return ToolChunk(
            content=[TextBlock(type="text", text=json.dumps(result, ensure_ascii=False))],
            state=ToolResultState.SUCCESS,
        )

    return product_search_tool
