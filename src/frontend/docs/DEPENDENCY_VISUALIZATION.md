# Frontend 服务依赖关系可视化

## 服务调用拓扑图

```
                                    ┌─────────────────────────────────────┐
                                    │      Frontend Service               │
                                    │   (Next.js Application)             │
                                    └─────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
            ┌───────▼────────┐            ┌────────▼────────┐            ┌─────────▼────────┐
            │  Pages (SSR)   │            │   API Routes    │            │  Client (CSR)    │
            │                │            │                 │            │                  │
            │  GET /         │            │  GET /api/*     │            │  React Query     │
            │  GET /cart     │            │                 │            │  API Calls       │
            └────────────────┘            └─────────────────┘            └──────────────────┘
                    │                               │                               │
                    └───────────────────────────────┼───────────────────────────────┘
                                                    │
                                    ┌───────────────▼───────────────┐
                                    │   Business Logic Layer        │
                                    │                               │
                                    │  • ProductCatalogService      │
                                    │  • ApiGateway                 │
                                    └───────────────┬───────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
            ┌───────▼────────┐            ┌────────▼────────┐            ┌─────────▼────────┐
            │  gRPC Gateways │            │  HTTP Client    │            │  Message         │
            │                │            │                 │            │  Collector       │
            │  • Product     │            │  Request.ts     │            │                  │
            │  • Cart        │            │                 │            │  (收集消息)       │
            │  • Currency    │            │                 │            │                  │
            │  • Recommend   │            │                 │            │                  │
            │  • Ad          │            │                 │            │                  │
            └────────────────┘            └─────────────────┘            └──────────────────┘
                    │                               │
                    │                               │
        ┌───────────┴───────────┬───────────────────┴───────────────┬──────────────┐
        │                       │                                   │              │
┌───────▼────────┐    ┌─────────▼────────┐    ┌──────────▼────────┐    ┌────────▼────────┐
│ ProductCatalog │    │   CartService    │    │  CurrencyService  │    │ Recommendation  │
│   Service      │    │                  │    │                   │    │    Service      │
│                │    │  (gRPC Server)   │    │  (gRPC Server)    │    │                 │
│ (gRPC Server)  │    │                  │    │                   │    │  (gRPC Server)  │
└────────────────┘    └──────────────────┘    └───────────────────┘    └─────────────────┘
```

## 详细调用流程图

### 场景 1: 首页加载 (GET /)

```
┌──────────┐
│ Browser  │
└────┬─────┘
     │ GET /
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: pages/index.tsx                                           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ React Component                                                 │ │
│ │   useQuery(['products', 'USD'])                                 │ │
│ │     → ApiGateway.listProducts('USD')                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP GET /api/products?currencyCode=USD
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: pages/api/products/index.ts                               │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ InstrumentationMiddleware                                       │ │
│ │   → ProductCatalogService.listProducts('USD')                   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌───────────────────────┐       ┌──────────────────────┐
    │ gRPC Call #1          │       │ gRPC Call #2-N       │
    │ ProductCatalogService │       │ CurrencyService      │
    │ /listProducts         │       │ /convert             │
    │                       │       │                      │
    │ Request: {}           │       │ Request: {           │
    │                       │       │   from: {            │
    │ Response: {           │       │     units: 10,       │
    │   products: [         │       │     currencyCode: USD│
    │     {id: "...",       │       │   },                 │
    │      name: "...",     │       │   toCode: "EUR"      │
    │      priceUsd: {...}} │       │ }                    │
    │   ]                   │       │                      │
    │ }                     │       │ Response: {          │
    │                       │       │   units: 9,          │
    │ ✅ 1 次调用            │       │   currencyCode: EUR  │
    │                       │       │ }                    │
    │                       │       │                      │
    │                       │       │ ✅ N 次调用 (N=产品数)│
    └───────────────────────┘       └──────────────────────┘
```

### 场景 2: 购物车页面 (GET /cart)

```
┌──────────┐
│ Browser  │
└────┬─────┘
     │ GET /cart
     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Frontend: pages/cart/index.tsx                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ React Component                                                         │ │
│ │   ├─ useCart() → GET /api/cart?sessionId=xxx&currencyCode=EUR          │ │
│ │   └─ Recommendations → GET /api/recommendations?productIds=...         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
┌───────────────────────────────────┐  ┌────────────────────────────────────┐
│ GET /api/cart                     │  │ GET /api/recommendations           │
│                                   │  │                                    │
│ Step 1: 获取购物车                 │  │ Step 1: 获取推荐列表                │
│   gRPC CartService/getCart        │  │   gRPC RecommendationService/      │
│   ✅ 1 次                          │  │        listRecommendations         │
│                                   │  │   ✅ 1 次                           │
│ Step 2: 获取商品详情 (M 个商品)    │  │                                    │
│   gRPC ProductCatalogService/     │  │ Step 2: 获取推荐商品详情 (最多4个)  │
│        getProduct                 │  │   gRPC ProductCatalogService/      │
│   ✅ M 次                          │  │        getProduct                  │
│                                   │  │   ✅ 4 次                           │
│ Step 3: 转换货币 (M 个商品)        │  │                                    │
│   gRPC CurrencyService/convert    │  │ Step 3: 转换货币 (最多4个)          │
│   ✅ M 次 (如果 currency != USD)   │  │   gRPC CurrencyService/convert     │
│                                   │  │   ✅ 4 次 (如果 currency != USD)    │
└───────────────────────────────────┘  └────────────────────────────────────┘

总计 gRPC 调用:
  • CartService/getCart: 1 次
  • RecommendationService/listRecommendations: 1 次
  • ProductCatalogService/getProduct: M + 4 次
  • CurrencyService/convert: M + 4 次 (如果非 USD)

如果 M=5, currency=EUR:
  总计 = 1 + 1 + 9 + 9 = 20 次 gRPC 调用
```

### 场景 3: 获取单个产品 (GET /api/products/{productId})

```
┌──────────┐
│ Client   │
└────┬─────┘
     │ GET /api/products/OLJCESPC7Z?currencyCode=EUR
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: pages/api/products/[productId]/index.ts                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ InstrumentationMiddleware                                       │ │
│ │   → ProductCatalogService.getProduct('OLJCESPC7Z', 'EUR')       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌───────────────────────┐       ┌──────────────────────┐
    │ gRPC Call #1          │       │ gRPC Call #2         │
    │ ProductCatalogService │       │ CurrencyService      │
    │ /getProduct           │       │ /convert             │
    │                       │       │                      │
    │ Request: {            │       │ Request: {           │
    │   id: "OLJCESPC7Z"    │       │   from: {            │
    │ }                     │       │     units: 10,       │
    │                       │       │     currencyCode: USD│
    │ Response: {           │       │   },                 │
    │   id: "OLJCESPC7Z",   │       │   toCode: "EUR"      │
    │   name: "Typewriter", │       │ }                    │
    │   priceUsd: {         │       │                      │
    │     units: 10,        │       │ Response: {          │
    │     currencyCode: USD │       │   units: 9,          │
    │   }                   │       │   currencyCode: EUR  │
    │ }                     │       │ }                    │
    │                       │       │                      │
    │ ✅ 1 次调用            │       │ ✅ 1 次调用           │
    │                       │       │ (如果 currency!=USD) │
    └───────────────────────┘       └──────────────────────┘

总计: 1-2 次 gRPC 调用
```

## 服务间调用频率热力图

```
                    ProductCatalog  Currency  Cart  Recommendation  Ad
                    ═════════════════════════════════════════════════════
GET /               🔥🔥🔥🔥🔥      🔥🔥🔥🔥    -     -               -
GET /cart           🔥🔥🔥🔥🔥      🔥🔥🔥🔥    🔥    🔥              -
GET /api/products   🔥🔥🔥🔥🔥      🔥🔥🔥🔥    -     -               -
GET /api/products/  🔥🔥           🔥🔥       -     -               -
  {productId}
GET /api/cart       🔥🔥🔥🔥        🔥🔥🔥     🔥    -               -
GET /api/currency   -              🔥        -     -               -
GET /api/           🔥🔥🔥          🔥🔥🔥     -     🔥              -
  recommendations
GET /api/data       -              -         -     -               🔥

图例:
🔥     = 1-2 次调用
🔥🔥   = 3-5 次调用
🔥🔥🔥 = 6-10 次调用
🔥🔥🔥🔥 = 11-20 次调用
🔥🔥🔥🔥🔥 = 20+ 次调用
```

## 关键路径分析

### 最短路径: GET /api/currency
```
Client → Frontend → CurrencyService
         (1 hop)    (1 gRPC call)
```

### 最长路径: GET /cart (购物车页面)
```
Browser → Frontend → CartService (1 call)
                  → ProductCatalogService (M+4 calls)
                  → CurrencyService (M+4 calls)
                  → RecommendationService (1 call)
         (1 hop)    (2M+10 gRPC calls)
```

## 扇出模式 (Fan-out Pattern)

Frontend 服务采用扇出模式，一个上游请求会触发多个下游调用：

```
                    GET /api/cart
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    CartService    ProductCatalog   CurrencyService
         │          (M 次调用)       (M 次调用)
         │
         └─→ 返回购物车商品 ID
                  │
                  └─→ 触发 M 次 ProductCatalog 调用
                           │
                           └─→ 每次触发 1 次 Currency 调用

扇出系数 = 1 + M + M = 2M + 1
```

## 依赖链深度

```
Level 0: Browser/Client
         │
Level 1: Frontend (Next.js)
         │
Level 2: Business Logic (ProductCatalogService, ApiGateway)
         │
Level 3: gRPC Gateways (Cart, Product, Currency, etc.)
         │
Level 4: Backend Services (gRPC Servers)

最大深度: 4 层
```

## 并发调用模式

Frontend 使用 `Promise.all` 实现并发调用：

```typescript
// 串行调用 (慢)
for (const product of products) {
  await getProduct(product.id);  // 等待每个完成
}
// 总时间 = N × 单次调用时间

// 并行调用 (快)
await Promise.all(
  products.map(product => getProduct(product.id))
);
// 总时间 ≈ 单次调用时间 (如果资源充足)
```

**优点**: 减少总延迟
**缺点**: 增加下游服务的瞬时负载

## 性能瓶颈识别

### 1. ProductCatalogService - 最频繁调用
```
调用频率: 🔥🔥🔥🔥🔥 (最高)
影响范围: 几乎所有 API
优化建议:
  • 添加缓存层
  • 实现批量查询 API
  • 使用 DataLoader 模式
```

### 2. CurrencyService - 条件高频调用
```
调用频率: 🔥🔥🔥🔥 (高，取决于货币选择)
影响范围: 所有涉及价格的 API
优化建议:
  • 缓存汇率
  • 批量转换 API
  • 客户端缓存转换结果
```

### 3. 购物车页面 - 最复杂场景
```
gRPC 调用数: 2M + 10 (M = 购物车商品数)
延迟: 高 (多次网络往返)
优化建议:
  • 实现 GraphQL 聚合查询
  • 服务端缓存
  • 减少推荐数量
```

## 总结

Frontend 服务的依赖关系特点：

1. **扇出模式**: 一个请求触发多个下游调用
2. **ProductCatalogService 是核心**: 几乎所有操作都依赖它
3. **并行调用**: 使用 Promise.all 提高性能
4. **条件依赖**: CurrencyService 只在非 USD 时调用
5. **级联调用**: 购物车场景涉及多层依赖
6. **性能挑战**: 购物车页面可能产生 20+ 次 gRPC 调用
