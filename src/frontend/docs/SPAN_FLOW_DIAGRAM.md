# Frontend Span 创建流程图

## 完整的请求追踪流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. 用户浏览器发送请求                                                    │
│    GET http://localhost:8080/api/cart?sessionId=xxx&currencyCode=USD    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Next.js 服务器接收请求                                                │
│    Node.js http 模块处理 HTTP 请求                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. @opentelemetry/instrumentation-http 自动拦截                         │
│    ✅ 自动创建 SERVER span                                               │
│                                                                          │
│    Span: HTTP GET /api/cart                                             │
│    Kind: SERVER                                                          │
│    Attributes:                                                           │
│      - http.method: GET                                                  │
│      - http.url: /api/cart?sessionId=xxx&currencyCode=USD               │
│      - http.target: /api/cart                                            │
│      - http.route: /api/cart                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Next.js 路由到 pages/api/cart.ts                                      │
│    export default InstrumentationMiddleware(handler)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. InstrumentationMiddleware 执行                                        │
│    const span = trace.getSpan(context.active())                         │
│    ⚠️  获取现有 span，不创建新 span                                      │
│                                                                          │
│    增强 span:                                                            │
│      - 添加 HTTP 状态码                                                  │
│      - 记录 metrics (requestCounter)                                     │
│      - 处理错误                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. API Handler 执行业务逻辑                                              │
│    const { userId, items } = await CartGateway.getCart(sessionId)       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. CartGateway.getCart() 调用                                            │
│    wrappedGetCart({ userId })                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 8. GrpcClientWrapper 创建 CLIENT span                                    │
│    ✅ 创建新的 CLIENT span                                               │
│                                                                          │
│    Span: gRPC CartService/getCart                                       │
│    Kind: CLIENT                                                          │
│    Attributes:                                                           │
│      - network.protocol: grpc                                            │
│      - rpc.service: CartService                                          │
│      - rpc.method: getCart                                               │
│      - rpc.system: grpc                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 9. MessageCollector 收集请求消息                                         │
│    ✅ 添加 grpc.request 事件                                             │
│                                                                          │
│    Event: grpc.request                                                   │
│      - message.direction: outbound                                       │
│      - message.protocol: grpc                                            │
│      - message.timestamp: 1699372800000                                  │
│      - message.size: 45                                                  │
│      - message.outbound.body: {"userId":"xxx"}                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 10. 执行实际的 gRPC 调用                                                 │
│     client.getCart({ userId }, callback)                                │
│                                                                          │
│     ──────────────────────────────────────────────────────────────────► │
│                         网络 IO 调用                                     │
│                         到 Cart Service                                  │
│     ◄────────────────────────────────────────────────────────────────── │
│                         返回响应                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 11. MessageCollector 收集响应消息                                        │
│     ✅ 添加 grpc.response 事件                                           │
│                                                                          │
│     Event: grpc.response                                                 │
│       - message.direction: inbound                                       │
│       - message.protocol: grpc                                           │
│       - message.timestamp: 1699372800123                                 │
│       - message.size: 234                                                │
│       - message.inbound.body: {"userId":"xxx","items":[...]}             │
│                                                                          │
│     ✅ 结束 CLIENT span                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 12. 继续处理其他业务逻辑                                                 │
│     await ProductCatalogService.getProduct(productId, currencyCode)     │
│     (重复步骤 7-11，创建新的 CLIENT span)                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 13. 返回响应给客户端                                                     │
│     res.status(200).json({ userId, items: productList })                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 14. InstrumentationMiddleware 完成                                       │
│     - 记录最终的 HTTP 状态码                                             │
│     - 更新 metrics                                                       │
│     - 结束 SERVER span                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 15. Trace 完成并导出到 OTLP Collector                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Span 层次结构（父子关系）

```
HTTP GET /api/cart (SERVER) ← 由 HTTP instrumentation 自动创建
│
├─ gRPC CartService/getCart (CLIENT) ← 由 GrpcClientWrapper 创建
│  ├─ Event: grpc.request ← 由 MessageCollector 添加
│  └─ Event: grpc.response ← 由 MessageCollector 添加
│
├─ gRPC ProductCatalogService/getProduct (CLIENT) ← 由 GrpcClientWrapper 创建
│  ├─ Event: grpc.request ← 由 MessageCollector 添加
│  └─ Event: grpc.response ← 由 MessageCollector 添加
│
├─ gRPC ProductCatalogService/getProduct (CLIENT) ← 第二个产品
│  ├─ Event: grpc.request
│  └─ Event: grpc.response
│
└─ ... (更多 CLIENT spans)
```

## 关键组件职责

| 组件 | 职责 | 创建 Span? | 收集消息? |
|------|------|-----------|----------|
| `@opentelemetry/instrumentation-http` | 自动拦截 HTTP 请求 | ✅ SERVER span | ❌ |
| `InstrumentationMiddleware` | 增强现有 span，记录 metrics | ❌ | ❌ |
| `GrpcClientWrapper` | 包装 gRPC 调用 | ✅ CLIENT span | ❌ |
| `MessageCollector` | 收集网络消息内容 | ❌ | ✅ |
| `Request.ts` (HTTP 客户端) | 包装 fetch 调用 | ✅ CLIENT span | ✅ |

## 为什么这样设计？

### 1. 自动 vs 手动

**自动创建 (HTTP instrumentation)**:
- ✅ 零配置，开箱即用
- ✅ 捕获所有 HTTP 请求
- ✅ 标准化的 span 名称和属性
- ❌ 无法自定义消息收集

**手动创建 (我们的实现)**:
- ✅ 完全控制 span 内容
- ✅ 可以收集详细的消息内容
- ✅ 可以过滤敏感信息
- ❌ 需要包装每个调用点

### 2. 为什么 InstrumentationMiddleware 不创建新 span？

如果创建新 span，会导致：
```
HTTP GET /api/cart (SERVER) ← HTTP instrumentation
└─ API Route Handler (INTERNAL) ← InstrumentationMiddleware
   └─ gRPC CartService/getCart (CLIENT) ← GrpcClientWrapper
```

这会增加一个不必要的 INTERNAL span，违反了"不包含 internal span"的原则。

### 3. 为什么我们的 CLIENT span 要手动创建？

因为：
1. **需要在网络调用前收集消息** - 自动 instrumentation 可能在调用后才记录
2. **需要详细的消息内容** - 自动 instrumentation 通常只记录元数据
3. **需要过滤敏感信息** - 自动 instrumentation 可能会记录所有内容
4. **需要统一的格式** - 与 Go 服务保持一致

## 实际的 Trace 示例

在 Jaeger 中查看：

```
Trace ID: 1234567890abcdef
Duration: 145ms

┌─ HTTP GET /api/cart (145ms) ─────────────────────────────────────┐
│  http.method: GET                                                 │
│  http.url: /api/cart?sessionId=xxx&currencyCode=USD              │
│  http.status_code: 200                                            │
│                                                                   │
│  ┌─ gRPC CartService/getCart (23ms) ──────────────────────────┐  │
│  │  rpc.service: CartService                                   │  │
│  │  rpc.method: getCart                                        │  │
│  │  rpc.grpc.status_code: 0                                    │  │
│  │  message.outbound.body: {"userId":"xxx"}                    │  │
│  │  message.inbound.body: {"userId":"xxx","items":[...]}       │  │
│  │                                                              │  │
│  │  Events:                                                     │  │
│  │    • grpc.request (t=0ms)                                   │  │
│  │    • grpc.response (t=23ms)                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ gRPC ProductCatalogService/getProduct (45ms) ─────────────┐  │
│  │  rpc.service: ProductCatalogService                         │  │
│  │  rpc.method: getProduct                                     │  │
│  │  message.outbound.body: {"id":"OLJCESPC7Z"}                 │  │
│  │  message.inbound.body: {"id":"OLJCESPC7Z","name":"..."...}  │  │
│  │                                                              │  │
│  │  Events:                                                     │  │
│  │    • grpc.request (t=25ms)                                  │  │
│  │    • grpc.response (t=70ms)                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ gRPC ProductCatalogService/getProduct (38ms) ─────────────┐  │
│  │  (第二个产品)                                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

## 总结

1. **SERVER span** 由 `@opentelemetry/instrumentation-http` **自动创建**
2. **CLIENT span** 由我们的 `GrpcClientWrapper` 和 `Request.ts` **手动创建**
3. **消息收集** 由我们的 `MessageCollector` 在网络调用前后执行
4. **InstrumentationMiddleware** 只是增强现有 span，不创建新 span
5. 整个设计符合"只收集网络 IO 消息，不包含 internal span"的原则
