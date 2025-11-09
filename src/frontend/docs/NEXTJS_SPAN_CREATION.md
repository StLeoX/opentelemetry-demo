# Next.js API Route Span 创建机制

## 概述

在 frontend 服务中，`executing api route (pages) /api/cart` 这样的 span 是由 **OpenTelemetry 自动 instrumentation** 创建的，而不是手动代码。

## Span 创建流程

### 1. OpenTelemetry SDK 初始化

在应用启动时，通过 `--require` 参数加载 instrumentation：

```json
// package.json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--require ./utils/telemetry/Instrumentation.js' next dev",
    "start": "node --require ./Instrumentation.js server.js"
  }
}
```

### 2. 自动 Instrumentation 配置

```javascript
// utils/telemetry/Instrumentation.js
const sdk = new opentelemetry.NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    })
  ],
  // ...
});

sdk.start();
```

`getNodeAutoInstrumentations()` 会自动加载多个 instrumentation 库，包括：

- **`@opentelemetry/instrumentation-http`** - HTTP 服务器和客户端的自动 instrumentation
- `@opentelemetry/instrumentation-grpc` - gRPC 的自动 instrumentation
- `@opentelemetry/instrumentation-express` - Express 框架的自动 instrumentation
- 等等...

### 3. HTTP Instrumentation 工作原理

`@opentelemetry/instrumentation-http` 会：

1. **Monkey-patch Node.js 的 `http` 和 `https` 模块**
   - 拦截 `http.createServer()` 和 `http.request()` 调用
   - 在每个 HTTP 请求到达时自动创建 span

2. **为每个 HTTP 请求创建 SERVER span**
   ```
   Span Name: HTTP GET /api/cart
   Span Kind: SERVER
   Attributes:
     - http.method: GET
     - http.url: /api/cart?sessionId=xxx&currencyCode=USD
     - http.target: /api/cart
     - http.route: /api/cart
     - http.status_code: 200
   ```

3. **Next.js 集成**
   - Next.js 底层使用 Node.js 的 `http` 模块
   - 当请求到达 `/api/cart` 时，HTTP instrumentation 自动创建 span
   - Next.js 的路由信息会被添加到 span 名称中

### 4. InstrumentationMiddleware 的作用

```typescript
// utils/telemetry/InstrumentationMiddleware.ts
const InstrumentationMiddleware = (handler: NextApiHandler): NextApiHandler => {
  return async (request, response) => {
    const span = trace.getSpan(context.active()) as Span;
    // 获取由 HTTP instrumentation 自动创建的 span
    
    // 添加额外的属性和指标
    await runWithSpan(span, async () => handler(request, response));
    
    // 记录 metrics
    requestCounter.add(1, { method, target, status: httpStatus });
  };
};
```

**InstrumentationMiddleware 不创建新的 span**，而是：
- 获取由 HTTP instrumentation 自动创建的当前 span
- 在这个 span 上添加额外的属性（如 HTTP 状态码）
- 记录自定义 metrics（请求计数器）
- 确保 handler 在正确的 span context 中执行

## Span 层次结构

```
┌─────────────────────────────────────────────────────────────┐
│ HTTP GET /api/cart (SERVER)                                 │
│ 由 @opentelemetry/instrumentation-http 自动创建             │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ InstrumentationMiddleware                               │ │
│ │ - 获取当前 span                                         │ │
│ │ - 添加额外属性                                          │ │
│ │ - 记录 metrics                                          │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ API Handler (/api/cart.ts)                          │ │ │
│ │ │                                                      │ │ │
│ │ │ ┌─────────────────────────────────────────────────┐ │ │ │
│ │ │ │ gRPC CartService/getCart (CLIENT)               │ │ │ │
│ │ │ │ 由我们的 GrpcClientWrapper 创建                 │ │ │ │
│ │ │ │ - grpc.request event                            │ │ │ │
│ │ │ │ - grpc.response event                           │ │ │ │
│ │ │ └─────────────────────────────────────────────────┘ │ │ │
│ │ │                                                      │ │ │
│ │ │ ┌─────────────────────────────────────────────────┐ │ │ │
│ │ │ │ gRPC ProductCatalogService/getProduct (CLIENT)  │ │ │ │
│ │ │ │ 由我们的 GrpcClientWrapper 创建                 │ │ │ │
│ │ │ │ - grpc.request event                            │ │ │ │
│ │ │ │ - grpc.response event                           │ │ │ │
│ │ │ └─────────────────────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 为什么 Span 名称是 "executing api route (pages) /api/cart"？

实际上，span 名称通常是：
- `HTTP GET /api/cart` - 由 HTTP instrumentation 创建
- `GET /api/cart` - 简化版本

"executing api route (pages)" 可能是：
1. **Next.js 特定的 instrumentation** - 如果安装了 Next.js 专用的 instrumentation
2. **自定义的 span 名称** - 在某些配置中可能会修改 span 名称
3. **Jaeger/Zipkin UI 的显示格式** - 后端可能会格式化 span 名称

## 验证 Span 创建

### 查看实际的 Span 名称

```typescript
// 在 InstrumentationMiddleware 中添加日志
const InstrumentationMiddleware = (handler: NextApiHandler): NextApiHandler => {
  return async (request, response) => {
    const span = trace.getSpan(context.active()) as Span;
    
    // 打印 span 信息
    console.log('Current Span:', {
      name: span?.name,
      spanId: span?.spanContext().spanId,
      traceId: span?.spanContext().traceId,
    });
    
    // ...
  };
};
```

### 查看 HTTP Instrumentation 配置

```javascript
// 可以自定义 HTTP instrumentation 的行为
const sdk = new opentelemetry.NodeSDK({
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        // 自定义 span 名称
        requestHook: (span, request) => {
          span.updateName(`executing api route (pages) ${request.url}`);
        },
        // 添加额外属性
        applyCustomAttributesOnSpan: (span, request, response) => {
          span.setAttribute('custom.route', request.url);
        },
      },
    })
  ],
});
```

## 关键点总结

1. **自动创建**: `executing api route (pages) /api/cart` 这个 span 是由 `@opentelemetry/instrumentation-http` **自动创建**的

2. **Monkey-patching**: HTTP instrumentation 通过 monkey-patching Node.js 的 `http` 模块来拦截所有 HTTP 请求

3. **Next.js 集成**: Next.js 的 API routes 底层使用 Node.js 的 `http` 模块，因此会被自动 instrumentation

4. **InstrumentationMiddleware 的角色**: 
   - 不创建新 span
   - 获取并增强现有 span
   - 添加自定义属性和 metrics

5. **我们的消息收集**: 
   - 在 CLIENT span 层面工作
   - 收集 gRPC 和 HTTP 客户端调用的消息
   - 不影响 SERVER span 的创建

## 相关文件

- `utils/telemetry/Instrumentation.js` - OpenTelemetry SDK 初始化
- `utils/telemetry/InstrumentationMiddleware.ts` - API route 中间件
- `pages/api/*.ts` - Next.js API routes
- `node_modules/@opentelemetry/instrumentation-http` - HTTP 自动 instrumentation（npm 包）

## 扩展阅读

- [OpenTelemetry HTTP Instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation-http)
- [OpenTelemetry Auto Instrumentations Node](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/metapackages/auto-instrumentations-node)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
