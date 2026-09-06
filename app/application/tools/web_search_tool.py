# -*- coding: utf-8 -*-
"""用于核验公开购物信息的 Web 搜索工具。"""
import json

import httpx
from agentscope.message import TextBlock, ToolResultState
from agentscope.tool import ToolChunk

from app.infrastructure.context import ShoppingContext
from app.infrastructure.eventbus import TradeEventBus
from app.infrastructure.settings import Settings

_TAVILY_ENDPOINT = "https://api.tavily.com/search"


def build_web_search_tool(settings: Settings, bus: TradeEventBus):
    api_key = settings.tavily_api_key

    async def web_search_tool(query: str, max_results: int = 5) -> ToolChunk:
        """联网核验商品标准、官方参数、评测资料及其他需要最新公开信息的问题。

        Args:
            query (`str`): 搜索关键词，如 "降噪耳机 官方续航参数"。
            max_results (`int`): 返回结果条数，默认 5。
        """
        session_id = ShoppingContext.current_session_id()
        bus.publish(session_id, "tool.invoke", {"tool": "web_search_tool", "args": {"query": query}})
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    _TAVILY_ENDPOINT,
                    json={"api_key": api_key, "query": query, "max_results": max_results, "search_depth": "basic"},
                )
                response.raise_for_status()
                body = response.json()
            results = [
                {"title": item.get("title", ""), "url": item.get("url", ""), "content": item.get("content", "")[:500]}
                for item in body.get("results", [])
            ]
        except (httpx.HTTPError, ValueError) as err:
            bus.publish(session_id, "tool.result", {"tool": "web_search_tool", "error": str(err)})
            return ToolChunk(
                content=[TextBlock(type="text", text=f"[error] web 搜索失败：{err}")],
                state=ToolResultState.ERROR,
            )
        bus.publish(session_id, "tool.result", {"tool": "web_search_tool", "hit_count": len(results)})
        return ToolChunk(
            content=[TextBlock(type="text", text=json.dumps({"results": results}, ensure_ascii=False))],
            state=ToolResultState.SUCCESS,
        )

    return web_search_tool
