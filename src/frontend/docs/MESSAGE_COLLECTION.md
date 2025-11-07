# Frontend 网络消息收集

## 概述

Frontend 服务现在已经集成了网络 IO 消息收集功能，类似于后端 Go 服务的实现。该功能会在 HTTP 和 gRPC 客户端调用**之前**收集请求和响应的消息内容，并将其记录到 OpenTelemetry span 中。

## 架构设计

### 核心组件

1. **MessageCollector** (`utils/telemetry/MessageCollector.ts`)
   - 单例模式的消息收集器
   - 负责收集 HTTP 和 gRPC 的请求/响应消息
   - 将消息内容记录到 OpenTelemetry span 的事件和属性中

2. **GrpcClientWrapper** (`utils/telemetry/GrpcClientWrapper.ts`)
   - gRPC 客户端包装器
   - 在 gRPC 调用前后自动收集消息
   - 创建独立的 CLIENT span 用于网络调用

3. **Request** (`utils/Request.ts`)
   - HTTP 客户端包装器
   - 在 fetch 调用前后自动收集消息
   - 创建独立的 CLIENT span 用于网络调用

## 实现细节

### HTTP 消息收集

HTTP 客户端会在每次请求时：
1. 创建一个 CLIENT span
2. 收集请求消息（URL、方法、头部、请求体）
3. 执行 fetch 调用
4. 收集响应消息（状态码、头部、响应体）
5. 将消息记录到 span 的事件和属性中

```typescript
// 自动收集，无需额外代码
const products = await ApiGateway.listProducts('USD');
```

### gRPC 消息收集

gRPC 客户端会在每次调用时：
1. 创建一个 CLIENT span
2. 收集请求消息（服务名、方法名、请求参数）
3. 执行 gRPC 调用
4. 收集响应消息（响应数据或错误）
5. 将消息记录到 span 的事件和属性中

```typescript
// 自动收集，无需额外代码
const product = await ProductCatalogGateway.getProduct('OLJCESPC7Z');
```

## 收集的数据

### HTTP 请求事件
- `message.direction`: "outbound"
- `message.protocol`: "http"
- `message.timestamp`: 时间戳
- `message.size`: 消息大小（字节）
- `http.method`: HTTP 方法
- `http.url`: 完整 URL
- `message.outbound.body`: 请求体（截断至 1000 字符）
- `message.outbound.header.*`: 请求头（过滤敏感信息）

### HTTP 响应事件
- `message.direction`: "inbound"
- `message.protocol`: "http"
- `message.timestamp`: 时间戳
- `message.size`: 消息大小（字节）
- `http.method`: HTTP 方法
- `http.url`: 完整 URL
- `http.status_code`: HTTP 状态码
- `message.inbound.body`: 响应体（截断至 1000 字符）
- `message.inbound.header.*`: 响应头（过滤敏感信息）

### gRPC 请求事件
- `message.direction`: "outbound"
- `message.protocol`: "grpc"
- `message.timestamp`: 时间戳
- `message.size`: 消息大小（字节）
- `rpc.service`: 服务名
- `rpc.method`: 方法名
- `rpc.system`: "grpc"
- `message.outbound.body`: 请求参数（截断至 1000 字符）

### gRPC 响应事件
- `message.direction`: "inbound"
- `message.protocol`: "grpc"
- `message.timestamp`: 时间戳
- `message.size`: 消息大小（字节）
- `rpc.service`: 服务名
- `rpc.method`: 方法名
- `rpc.grpc.status_code`: gRPC 状态码
- `message.inbound.body`: 响应数据或错误（截断至 1000 字符）

## 安全性

### 敏感信息过滤

以下 HTTP 头部会被自动过滤，不会记录到 span 中：
- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`

### 消息截断

为避免 span 过大，消息体会被截断至 1000 字符。如果需要调整，可以修改 `MessageCollector.ts` 中的截断逻辑。

## 已集成的服务

所有 gRPC gateway 都已集成消息收集：
- ✅ ProductCatalogService
- ✅ CartService
- ✅ CurrencyService
- ✅ CheckoutService
- ✅ ShippingService
- ✅ RecommendationService
- ✅ AdService

所有 HTTP API 调用都已集成消息收集：
- ✅ `/api/cart`
- ✅ `/api/currency`
- ✅ `/api/shipping`
- ✅ `/api/checkout`
- ✅ `/api/products`
- ✅ `/api/recommendations`
- ✅ `/api/data`

## 与 Go 服务的对比

| 特性 | Go 服务 | Frontend 服务 |
|------|---------|---------------|
| 收集时机 | gRPC/HTTP 客户端调用前 | gRPC/HTTP 客户端调用前 |
| Span 类型 | CLIENT | CLIENT |
| 消息方向 | outbound/inbound | outbound/inbound |
| 协议支持 | gRPC | gRPC + HTTP |
| 敏感信息过滤 | ✅ | ✅ |
| 消息截断 | ✅ | ✅ |
| Internal span | 不包含 | 不包含 |

## 注意事项

1. **不包含 Internal Span**: 消息收集只针对网络 IO 调用，不包含应用内部的 span
2. **性能影响**: 消息收集会增加少量性能开销，主要来自 JSON 序列化和字符串操作
3. **存储成本**: 收集的消息会增加 trace 数据的存储成本
4. **自动启用**: 该功能已自动集成到所有网络调用中，无需额外配置

## 查看收集的数据

在 OpenTelemetry 后端（如 Jaeger、Zipkin）中，可以查看：
1. Span 事件列表中的 `http.request`、`http.response`、`grpc.request`、`grpc.response` 事件
2. Span 属性中的 `message.*` 属性
3. 每个网络调用都会创建独立的 CLIENT span，便于追踪

## 示例 Span 结构

```
Frontend Request Span
├── HTTP GET /api/products (CLIENT)
│   ├── Event: http.request
│   │   ├── message.direction: outbound
│   │   ├── message.protocol: http
│   │   ├── http.method: GET
│   │   └── http.url: /api/products?currencyCode=USD
│   └── Event: http.response
│       ├── message.direction: inbound
│       ├── message.protocol: http
│       ├── http.status_code: 200
│       └── message.inbound.body: [{"id":"OLJCESPC7Z",...}]
│
└── gRPC ProductCatalogService/listProducts (CLIENT)
    ├── Event: grpc.request
    │   ├── message.direction: outbound
    │   ├── message.protocol: grpc
    │   ├── rpc.service: ProductCatalogService
    │   └── rpc.method: listProducts
    └── Event: grpc.response
        ├── message.direction: inbound
        ├── message.protocol: grpc
        ├── rpc.grpc.status_code: 0
        └── message.inbound.body: {"products":[...]}
```
