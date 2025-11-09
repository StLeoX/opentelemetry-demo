# Frontend 服务依赖关系总结

## 快速参考

### 上游操作 → 下游 gRPC 调用映射表

| 上游操作 | 下游 gRPC 调用 | 调用次数 | 代码位置 |
|---------|---------------|---------|---------|
| `GET /` | ProductCatalogService/listProducts<br>CurrencyService/convert | 1次<br>N次* | pages/index.tsx<br>pages/api/products/index.ts |
| `GET /cart` | CartService/getCart<br>ProductCatalogService/getProduct<br>CurrencyService/convert<br>RecommendationService/listRecommendations | 1次<br>M+4次<br>M+4次*<br>1次 | pages/cart/index.tsx<br>pages/api/cart.ts<br>pages/api/recommendations.ts |
| `GET /api/products` | ProductCatalogService/listProducts<br>CurrencyService/convert | 1次<br>N次* | pages/api/products/index.ts |
| `GET /api/products/{id}` | ProductCatalogService/getProduct<br>CurrencyService/convert | 1次<br>1次* | pages/api/products/[productId]/index.ts |
| `GET /api/cart` | CartService/getCart<br>ProductCatalogService/getProduct<br>CurrencyService/convert | 1次<br>M次<br>M次* | pages/api/cart.ts |
| `GET /api/currency` | CurrencyService/getSupportedCurrencies | 1次 | pages/api/currency.ts |
| `GET /api/recommendations` | RecommendationService/listRecommendations<br>ProductCatalogService/getProduct<br>CurrencyService/convert | 1次<br>4次<br>4次* | pages/api/recommendations.ts |
| `GET /api/data` | AdService/getAds | 1次 | pages/api/data.ts |

**注释**:
- `*` = 仅当货币不是 USD 时调用
- `N` = 产品列表数量（通常 10-20）
- `M` = 购物车商品数量（通常 1-10）

## 核心依赖模式

### 1. ProductCatalogService - 中心枢纽

```
所有产品相关操作
    ↓
ProductCatalogService
    ↓
├─ ProductCatalogService/listProducts (获取列表)
├─ ProductCatalogService/getProduct (获取单个)
└─ CurrencyService/convert (货币转换)
```

**使用场景**:
- 首页产品列表
- 产品详情页
- 购物车商品详情
- 推荐商品

**代码位置**: `services/ProductCatalog.service.ts`

### 2. 条件货币转换

```typescript
// 只在非 USD 时调用
async getProductPrice(price: Money, currencyCode: string) {
  return currencyCode !== 'USD'
    ? await CurrencyGateway.convert(price, currencyCode)  // gRPC 调用
    : price;  // 直接返回
}
```

**影响**:
- USD 用户: 不产生额外 gRPC 调用
- 其他货币用户: 每个产品 +1 次 gRPC 调用

### 3. 并行批量调用

```typescript
// 对多个产品并行处理
await Promise.all(
  products.map(async product => {
    const priceUsd = await this.getProductPrice(product.priceUsd!, currencyCode);
    return { ...product, priceUsd };
  })
);
```

**优点**: 减少总延迟
**缺点**: 瞬时负载高

## 典型场景分析

### 场景 A: 用户访问首页 (USD 货币)

```
用户操作: 打开 http://localhost:8080/
货币: USD
产品数: 10

调用链:
  Browser → GET /
    → GET /api/products?currencyCode=USD
      → ProductCatalogService/listProducts (1次)
      → CurrencyService/convert (0次，因为是 USD)

总计: 1 次 gRPC 调用
延迟: ~50ms
```

### 场景 B: 用户访问首页 (EUR 货币)

```
用户操作: 打开 http://localhost:8080/
货币: EUR
产品数: 10

调用链:
  Browser → GET /
    → GET /api/products?currencyCode=EUR
      → ProductCatalogService/listProducts (1次)
      → CurrencyService/convert (10次，每个产品1次)

总计: 11 次 gRPC 调用
延迟: ~150ms (并行调用)
```

### 场景 C: 用户查看购物车 (EUR 货币，5个商品)

```
用户操作: 打开 http://localhost:8080/cart
货币: EUR
购物车商品: 5
推荐商品: 4

调用链:
  Browser → GET /cart
    → GET /api/cart?currencyCode=EUR
      → CartService/getCart (1次)
      → ProductCatalogService/getProduct (5次)
      → CurrencyService/convert (5次)
    
    → GET /api/recommendations?currencyCode=EUR
      → RecommendationService/listRecommendations (1次)
      → ProductCatalogService/getProduct (4次)
      → CurrencyService/convert (4次)

总计: 20 次 gRPC 调用
延迟: ~300ms (并行调用)
```

## 性能影响矩阵

| 场景 | gRPC 调用数 (USD) | gRPC 调用数 (非USD) | 延迟估算 |
|------|------------------|-------------------|---------|
| 首页 (10产品) | 1 | 11 | 50-150ms |
| 产品详情 | 1 | 2 | 30-60ms |
| 购物车 (5商品) | 7 | 17 | 150-300ms |
| 购物车+推荐 (5+4) | 11 | 20 | 200-400ms |
| 推荐列表 (4商品) | 5 | 9 | 100-200ms |

## 关键代码位置

### API Routes (上游入口)
```
pages/api/
├── cart.ts                    # 购物车 API
├── checkout.ts                # 结账 API
├── currency.ts                # 货币 API
├── data.ts                    # 广告 API
├── recommendations.ts         # 推荐 API
├── shipping.ts                # 运费 API
└── products/
    ├── index.ts               # 产品列表 API
    └── [productId]/index.ts   # 单个产品 API
```

### Business Logic (业务逻辑)
```
services/
└── ProductCatalog.service.ts  # 产品目录服务（核心）
```

### gRPC Gateways (下游调用)
```
gateways/rpc/
├── ProductCatalog.gateway.ts  # 产品目录 gRPC 客户端
├── Cart.gateway.ts            # 购物车 gRPC 客户端
├── Currency.gateway.ts        # 货币 gRPC 客户端
├── Recommendations.gateway.ts # 推荐 gRPC 客户端
├── Ad.gateway.ts              # 广告 gRPC 客户端
├── Checkout.gateway.ts        # 结账 gRPC 客户端
└── Shipping.gateway.ts        # 运费 gRPC 客户端
```

### Message Collection (消息收集)
```
utils/telemetry/
├── MessageCollector.ts        # 消息收集器
├── GrpcClientWrapper.ts       # gRPC 客户端包装器
└── InstrumentationMiddleware.ts # API 中间件
```

## 优化建议

### 1. 短期优化（易实现）

**缓存货币转换结果**
```typescript
// 在 ProductCatalogService 中添加缓存
const currencyCache = new Map<string, Money>();

async getProductPrice(price: Money, currencyCode: string) {
  const cacheKey = `${price.units}_${price.currencyCode}_${currencyCode}`;
  
  if (currencyCache.has(cacheKey)) {
    return currencyCache.get(cacheKey)!;
  }
  
  const converted = await CurrencyGateway.convert(price, currencyCode);
  currencyCache.set(cacheKey, converted);
  return converted;
}
```

**减少推荐数量**
```typescript
// 从 4 个减少到 2 个
productList.slice(0, 2)  // 减少 50% 的调用
```

### 2. 中期优化（需要协调）

**批量货币转换 API**
```typescript
// 新增批量转换接口
interface BatchConvertRequest {
  prices: Money[];
  toCode: string;
}

// 一次调用转换多个价格
const convertedPrices = await CurrencyGateway.batchConvert(
  products.map(p => p.priceUsd),
  currencyCode
);
```

**产品信息缓存**
```typescript
// 使用 Redis 缓存产品信息
const cachedProduct = await redis.get(`product:${productId}`);
if (cachedProduct) {
  return JSON.parse(cachedProduct);
}
```

### 3. 长期优化（架构改进）

**GraphQL 聚合层**
```graphql
query GetCart($sessionId: ID!, $currency: String!) {
  cart(sessionId: $sessionId) {
    items {
      productId
      quantity
      product {
        id
        name
        price(currency: $currency) {
          amount
          currency
        }
      }
    }
    recommendations(limit: 4) {
      id
      name
      price(currency: $currency) {
        amount
        currency
      }
    }
  }
}
```

**BFF (Backend for Frontend) 模式**
```
Browser → Frontend (Next.js)
            ↓
          BFF Service (聚合层)
            ↓
    ┌───────┼───────┬───────┐
    ↓       ↓       ↓       ↓
  Product  Cart  Currency  Recommendation
```

## 监控指标建议

### 1. 调用频率监控
```
指标: grpc_client_calls_total
标签: {service, method}

告警: 
  - ProductCatalogService/getProduct > 1000 calls/min
  - CurrencyService/convert > 500 calls/min
```

### 2. 延迟监控
```
指标: grpc_client_duration_seconds
标签: {service, method}

告警:
  - p99 > 500ms
  - p95 > 300ms
```

### 3. 扇出系数监控
```
指标: api_downstream_calls_count
标签: {api_route}

告警:
  - GET /api/cart 平均扇出 > 15
```

## 相关文档

- [消息收集功能说明](./MESSAGE_COLLECTION.md)
- [Span 创建机制](./NEXTJS_SPAN_CREATION.md)
- [依赖关系可视化](./DEPENDENCY_VISUALIZATION.md)
- [完整依赖分析](./UPSTREAM_DOWNSTREAM_DEPENDENCIES.md)

## 总结

Frontend 服务的依赖关系呈现以下特点：

1. **ProductCatalogService 是核心依赖**，几乎所有操作都需要它
2. **货币转换是条件依赖**，USD 用户不产生额外调用
3. **购物车是最复杂场景**，可能产生 20+ 次 gRPC 调用
4. **并行调用提高性能**，但增加下游瞬时负载
5. **扇出模式普遍存在**，一个请求触发多个下游调用
6. **优化空间大**，通过缓存和批量 API 可显著减少调用次数
