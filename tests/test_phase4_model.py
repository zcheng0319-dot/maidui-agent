# -*- coding: utf-8 -*-
"""四期第一部分：ThrottledChatModel 的闸门持有、退避重试与限流回退

桩替换 `_invoke_upstream`，不接触真实网关。
重点验证流式分支：名额必须持有到流耗尽——若在返回生成器时就释放，限流形同虚设。
"""
from __future__ import annotations

import asyncio

import pytest
from agentscope.credential import OpenAICredential

from app.infrastructure.context import ShoppingContext, ShoppingContextSnapshot
from app.infrastructure.eventbus import TradeEventBus
from app.infrastructure.llm import ThrottledChatModel
from app.infrastructure.throttle import GatewayThrottle

pytestmark = pytest.mark.asyncio

_CREDENTIAL = OpenAICredential(api_key="test-key", base_url="http://127.0.0.1:9/v1")


class StubUpstreamModel(ThrottledChatModel):
    """用预设行为替代真实上游：每次调用弹出一个 behavior。

    behavior 取值：
        Exception 实例      -> 抛出
        ("stream", n)       -> 返回产出 n 个分片的异步生成器
        其他                 -> 直接作为非流式返回值
    """

    def __init__(self, behaviors: list, **kwargs) -> None:
        super().__init__(**kwargs)
        self._behaviors = list(behaviors)
        self.upstream_calls = 0
        self.concurrent_peak = 0
        self._in_flight = 0

    async def _invoke_upstream(self, messages, tools, tool_choice, **kwargs):
        self.upstream_calls += 1
        behavior = self._behaviors.pop(0) if self._behaviors else "ok"
        if isinstance(behavior, BaseException):
            raise behavior
        if isinstance(behavior, tuple) and behavior[0] == "stream":
            return self._stream(behavior[1])
        return behavior

    async def _stream(self, chunks: int):
        self._in_flight += 1
        self.concurrent_peak = max(self.concurrent_peak, self._in_flight)
        try:
            for index in range(chunks):
                await asyncio.sleep(0.02)
                yield f"chunk-{index}"
        finally:
            self._in_flight -= 1


def _build(behaviors, *, throttle=None, fallback=None, retries=0, bus=None) -> StubUpstreamModel:
    return StubUpstreamModel(
        behaviors,
        credential=_CREDENTIAL,
        model="primary-model",
        throttle=throttle or GatewayThrottle(max_concurrency=1, min_interval_seconds=0),
        fallback=fallback,
        max_transient_retries=retries,
        retry_base_seconds=0.01,
        bus=bus,
    )


class FakeFallbackModel:
    """备用模型替身：只需暴露 model 属性与可等待调用。"""

    def __init__(self) -> None:
        self.model = "fallback-model"
        self.calls = 0

    async def __call__(self, messages, tools=None, tool_choice=None, **kwargs):
        self.calls += 1
        return "fallback-reply"


class TestThrottleHeldUntilStreamDrained:
    async def test_stream_holds_slot_until_drained(self):
        """并发上限 1 时，第二个流必须等第一个流读完才能开始。"""
        throttle = GatewayThrottle(max_concurrency=1, min_interval_seconds=0)
        model = _build([("stream", 3), ("stream", 3)], throttle=throttle)

        async def consume():
            stream = await model([])
            return [chunk async for chunk in stream]

        results = await asyncio.gather(consume(), consume())
        assert all(len(chunks) == 3 for chunks in results)
        assert model.concurrent_peak == 1, (
            f"闸门未持有到流耗尽，出现 {model.concurrent_peak} 个流同时在飞"
        )

    async def test_slot_released_after_stream_drained(self):
        """流读完后名额要归还，否则第二次调用会直接卡死。"""
        throttle = GatewayThrottle(max_concurrency=1, min_interval_seconds=0)
        model = _build([("stream", 2), "ok"], throttle=throttle)

        stream = await model([])
        assert [chunk async for chunk in stream] == ["chunk-0", "chunk-1"]
        assert await asyncio.wait_for(model([]), timeout=0.5) == "ok"

    async def test_slot_released_when_upstream_raises(self):
        throttle = GatewayThrottle(max_concurrency=1, min_interval_seconds=0)
        model = _build([ValueError("bad request"), "ok"], throttle=throttle)

        with pytest.raises(ValueError):
            await model([])
        assert await asyncio.wait_for(model([]), timeout=0.5) == "ok"


class TestRetryAndFallback:
    async def test_transient_error_retried_then_succeeds(self):
        model = _build([RuntimeError("Too many concurrent requests."), "ok"], retries=2)
        assert await model([]) == "ok"
        assert model.upstream_calls == 2

    async def test_business_error_not_retried(self):
        """模型不存在这类错误必须立刻抛出，不能浪费退避时间。"""
        model = _build([RuntimeError("model_not_found"), "ok"], retries=2)
        with pytest.raises(RuntimeError, match="model_not_found"):
            await model([])
        assert model.upstream_calls == 1

    async def test_falls_back_after_retries_exhausted(self):
        fallback = FakeFallbackModel()
        bus = TradeEventBus()
        queue = bus.subscribe("s-fallback")
        model = _build(
            [RuntimeError("Throttling.Concurrency")] * 3,
            fallback=fallback,
            retries=2,
            bus=bus,
        )

        # 事件需按会话路由，模型层从 ShoppingContext 取当前会话
        token = ShoppingContext.set(
            ShoppingContextSnapshot(
                shopping_session_id="s-fallback", buyer_id="b", locale="zh-CN", currency="CNY",
            ),
        )
        try:
            assert await model([]) == "fallback-reply"
        finally:
            ShoppingContext.reset(token)

        assert model.upstream_calls == 3, "主模型应先把重试次数用尽"
        assert fallback.calls == 1

        event = queue.get_nowait()
        assert event.type == "model.fallback"
        assert event.payload["from"] == "primary-model"
        assert event.payload["to"] == "fallback-model"
        assert "Throttling" in event.payload["reason"]

    async def test_raises_when_no_fallback_configured(self):
        model = _build([RuntimeError("429 rate limit")] * 2, retries=1)
        with pytest.raises(RuntimeError, match="429"):
            await model([])


class StubResponseWithKeyErrorGetAttr:
    """模拟某些 LLM response object 的非标准 __getattr__：对未知属性抛 KeyError。
    
    这是 DeepSeek V4-Pro + AgentScope 组合中观察到的行为：
    hasattr(obj, "__aiter__") 会触发 obj.__getattr__("__aiter__")，
    而该实现抛出 KeyError 而非 AttributeError，导致 hasattr() 崩溃。
    """
    
    def __init__(self, content: str = "test-response"):
        self.content = content
    
    def __getattr__(self, name: str):
        # 非标准实现：抛 KeyError 而不是 AttributeError
        raise KeyError(f"Attribute '{name}' not found")


class TestThrottledChatModelKeyErrorCompatibility:
    """回归测试：确保 ThrottledChatModel 能处理 __getattr__ 抛 KeyError 的 response object。"""
    
    async def test_non_stream_response_with_keyerror_getattr_does_not_crash(self):
        """CASE A: 普通 response object，其 __getattr__ 对未知字段抛 KeyError。
        
        期望：ThrottledChatModel 不崩溃，按 non-stream response 处理。
        """
        throttle = GatewayThrottle(max_concurrency=1, min_interval_seconds=0)
        
        class StubModelWithKeyErrorResponse(StubUpstreamModel):
            async def _invoke_upstream(self, messages, tools, tool_choice, **kwargs):
                # 返回一个 __getattr__ 抛 KeyError 的对象
                return StubResponseWithKeyErrorGetAttr(content="OK")
        
        model = StubModelWithKeyErrorResponse(
            behaviors=[],
            credential=_CREDENTIAL,
            model="test-model",
            throttle=throttle,
        )
        
        # 应该不崩溃，正常返回 response
        result = await model([])
        assert isinstance(result, StubResponseWithKeyErrorGetAttr)
        assert result.content == "OK"
    
    async def test_async_generator_still_detected_as_stream(self):
        """CASE B: 真正 async iterator / async generator。
        
        期望：识别为 stream，走 _release_after_stream。
        """
        throttle = GatewayThrottle(max_concurrency=1, min_interval_seconds=0)
        
        class StubModelWithAsyncGen(StubUpstreamModel):
            async def _invoke_upstream(self, messages, tools, tool_choice, **kwargs):
                # Return an actual async generator, not a coroutine
                async def inner_gen():
                    for i in range(3):
                        yield f"chunk-{i}"
                return inner_gen()
        
        model = StubModelWithAsyncGen(
            behaviors=[],
            credential=_CREDENTIAL,
            model="test-model",
            throttle=throttle,
        )
        
        # 应该识别为 stream 并正确消费
        chunks = []
        result = await model([])  # __call__ is async, need to await it
        
        # Now check if result is an async generator
        import inspect
        if inspect.isasyncgen(result):
            async for chunk in result:
                chunks.append(chunk)
        else:
            # If not a stream, result should be the response object itself
            raise AssertionError(f"Expected async generator but got {type(result)}")
        
        assert chunks == ["chunk-0", "chunk-1", "chunk-2"]
    
    async def test_slot_released_for_non_stream_with_keyerror_getattr(self):
        """CASE C: 确保 slot 在 non-stream 返回后正常释放。"""
        throttle = GatewayThrottle(max_concurrency=1, min_interval_seconds=0)
        
        call_count = 0
        
        class StubModelWithKeyErrorResponse(StubUpstreamModel):
            async def _invoke_upstream(self, messages, tools, tool_choice, **kwargs):
                nonlocal call_count
                call_count += 1
                return StubResponseWithKeyErrorGetAttr(content=f"response-{call_count}")
        
        model = StubModelWithKeyErrorResponse(
            behaviors=[],
            credential=_CREDENTIAL,
            model="test-model",
            throttle=throttle,
        )
        
        # 连续调用两次，如果第一次没释放 slot，第二次会超时
        result1 = await model([])
        result2 = await model([])
        
        assert result1.content == "response-1"
        assert result2.content == "response-2"
        assert call_count == 2
