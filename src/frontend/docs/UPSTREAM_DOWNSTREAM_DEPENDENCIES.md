# Frontend 服务上下游依赖关系分析

## 概述

Frontend 服务作为用户界面层，接收来自浏览器的 HTTP 请求（上游），并调用后端的 gRPC 服务（下游）。

## 完整依赖关系图

```
浏览器请求 (上游)                Frontend API/Page                    gRPC 服务调用 (下游)
═══════════════════════════════════════════════════════════════════════════════════════════

GET /
  └─> pages/index.tsx
      └─> ApiGateway.listProducts(currency)
          └─> GET /api/products?currencyCode=USD
              └─> ProductCatalogService.listProducts(currency)
                  ├─> gRPC ProductCatalogService/listProducts
                  └─> (对每个产品) gRPC CurrencyService/convert

GET /cart
  └─> pages/cart/index.tsx
      ├─> useCart() hook
      │   └─> GET /api/cart?sessionId=xxx&currencyCode=USD
      │       └─> CartGateway.getCart(sessionId)
      │           ├─> gRPC CartService/getCart
      │           └─> (对每个商品) ProductCatalogService.getProduct()
      │               ├─> gRPC ProductCatalogService/getProduct
      │               └─> gRPC CurrencyService/convert
      │
      └─> Recommendations component
          └─> GET /api/recommendations?productIds=...&sessionId=...&currencyCode=...
              ├─> gRPC RecommendationService/listRecommendations
              └─> (对每个推荐) ProductCatalogService.getProduct()
                  ├─> gRPC ProductCatalogService/getProduct
                  └─> gRPC CurrencyService/convert

GET /api/products
  └─> pages/api/products/index.ts
      └─> ProductCatalogService.listProducts(currency)
          ├─> gRPC ProductCatalogService/listProducts
          └─> (对每个产品) gRPC CurrencyService/convert

GET /api/products/{productId}
  └─> pages/api/products/[productId]/index.ts
      └─> ProductCatalogService.getProduct(productId, currency)
          ├─> gRPC ProductCatalogService/getProduct
          └─> gRPC CurrencyService/convert

GET /api/cart
  └─> pages/api/cart.ts
      ├─> CartGateway.getCart(sessionId)
      │   └─> gRPC CartService/getCart
      └─> (对每个商品) ProductCatalogService.getProduct()
          ├─> gRPC ProductCatalogService/getProduct
          └─> gRPC CurrencyService/convert

GET /api/currency
  └─> pages/api/currency.ts
      └─> CurrencyGateway.getSupportedCurrencies()
          └─> gRPC CurrencyService/getSupportedCurrencies

GET /api/recommendations
  └─> pages/api/recommendations.ts
      ├─> RecommendationsGateway.listRecommendations(sessionId, productIds)
      │   └─> gRPC RecommendationService/listRecommendations
      └─> (对每个推荐，最多4个) ProductCatalogService.getProduct()
          ├─> gRPC ProductCatalogService/getProduct
          └─> gRPC CurrencyService/convert

GET /api/data
  └─> pages/api/data.ts
      └─> AdGateway.listAds(contextKeys)
          └─> gRPC AdService/getAds
```

## 详细依赖关系分析

### 1. GET / (首页)

**上游操作**: `GET /`

**调用链**:
```
浏览器 → GET /
  → pages/index.tsx (SSR/CSR)
    → ApiGateway.listProducts(selectedCurrency)
      → GET /api/products?currencyCode=USD
        → ProductCatalogService.listProducts('USD')
          → gRPC ProductCatalogService/listProducts
          → (对每个产品) gRPC CurrencyService/convert (如果 currency != USD)
```

**下游 gRPC 调用**:
- `gRPC ProductCatalogService/listProducts` (1次)
- `gRPC CurrencyService/convert` (N次，N = 产品数量，仅当货币不是 USD)

**代码位置**:
- `pages/index.tsx` - 页面组件
- `pages/api/products/index.ts` - API handler
- `services/ProductCatalog.service.ts` - 业务逻辑

---

### 2. GET /cart (购物车页面)

**上游操作**: `GET /cart`

**调用链**:
```
浏览器 → GET /cart
  → pages/cart/index.tsx (SSR/CSR)
    ├─ useCart() hook
    │   → GET /api/cart?sessionId=xxx&currencyCode=USD
    │     → CartGateway.getCart(sessionId)
    │       → gRPC CartService/getCart
    │     → (对购物车中每个商品) ProductCatalogService.getProduct()
    │       → gRPC ProductCatalogService/getProduct
    │       → gRPC CurrencyService/convert (如果 currency != USD)
    │
    └─ Recommendations component
        → GET /api/recommendations?productIds=...&sessionId=...&currencyCode=...
          → gRPC RecommendationService/listRecommendations
          → (对每个推荐，最多4个) ProductCatalogService.getProduct()
            → gRPC ProductCatalogService/getProduct
            → gRPC CurrencyService/convert (如果 currency != USD)
```

**下游 gRPC 调用**:
- `gRPC CartService/getCart` (1次)
- `gRPC ProductCatalogService/getProduct` (M次，M = 购物车商品数量)
- `gRPC CurrencyService/convert` (M次，仅当货币不是 USD)
- `gRPC RecommendationService/listRecommendations` (1次)
- `gRPC ProductCatalogService/getProduct` (最多4次，用于推荐商品)
- `gRPC CurrencyService/convert` (最多4次，用于推荐商品)

**代码位置**:
- `pages/cart/index.tsx` - 页面组件
- `pages/api/cart.ts` - Cart API handler
- `pages/api/recommendations.ts` - Recommendations API handler

---

### 3. GET /api/products (产品列表 API)

**上游操作**: `GET /api/products`

**调用链**:
```
客户端 → GET /api/products?currencyCode=USD
  → ProductCatalogService.listProducts('USD')
    → gRPC ProductCatalogService/listProducts
    → (对每个产品) gRPC CurrencyService/convert (如果 currency != USD)
```

**下游 gRPC 调用**:
- `gRPC ProductCatalogService/listProducts` (1次)
- `gRPC CurrencyService/convert` (N次，N = 产品数量)

**代码位置**:
- `pages/api/products/index.ts`
- `services/ProductCatalog.service.ts`

---

### 4. GET /api/products/{productId} (单个产品 API)

**上游操作**: `GET /api/products/{productId}`

**调用链**:
```
客户端 → GET /api/products/OLJCESPC7Z?currencyCode=USD
  → ProductCatalogService.getProduct('OLJCESPC7Z', 'USD')
    → gRPC ProductCatalogService/getProduct
    → gRPC CurrencyService/convert (如果 currency != USD)
```

**下游 gRPC 调用**:
- `gRPC ProductCatalogService/getProduct` (1次)
- `gRPC CurrencyService/convert` (1次，仅当货币不是 USD)

**代码位置**:
- `pages/api/products/[productId]/index.ts`
- `services/ProductCatalog.service.ts`

---

### 5. GET /api/cart (购物车 API)

**上游操作**: `GET /api/cart`

**调用链**:
```
客户端 → GET /api/cart?sessionId=xxx&currencyCode=USD
  → CartGateway.getCart(sessionId)
    → gRPC CartService/getCart
  → (对每个购物车商品) ProductCatalogService.getProduct()
    → gRPC ProductCatalogService/getProduct
    → gRPC CurrencyService/convert (如果 currency != USD)
```

**下游 gRPC 调用**:
- `gRPC CartService/getCart` (1次)
- `gRPC ProductCatalogService/getProduct` (M次，M = 购物车商品数量)
- `gRPC CurrencyService/convert` (M次)

**代码位置**:
- `pages/api/cart.ts`
- `gateways/rpc/Cart.gateway.ts`
- `services/ProductCatalog.service.ts`

---

### 6. GET /api/currency (货币列表 API)

**上游操作**: `GET /api/currency`

**调用链**:
```
客户端 → GET /api/currency
  → CurrencyGateway.getSupportedCurrencies()
    → gRPC CurrencyService/getSupportedCurrencies
```

**下游 gRPC 调用**:
- `gRPC CurrencyService/getSupportedCurrencies` (1次)

**代码位置**:
- `pages/api/currency.ts`
- `gateways/rpc/Currency.gateway.ts`

---

### 7. GET /api/recommendations (推荐 API)

**上游操作**: `GET /api/recommendations`

**调用链**:
```
客户端 → GET /api/recommendations?productIds=...&sessionId=...&currencyCode=USD
  → RecommendationsGateway.listRecommendations(sessionId, productIds)
    → gRPC RecommendationService/listRecommendations
  → (对每个推荐，最多4个) ProductCatalogService.getProduct()
    → gRPC ProductCatalogService/getProduct
    → gRPC CurrencyService/convert (如果 currency != USD)
```

**下游 gRPC 调用**:
- `gRPC RecommendationService/listRecommendations` (1次)
- `gRPC ProductCatalogService/getProduct` (最多4次)
- `gRPC CurrencyService/convert` (最多4次)

**代码位置**:
- `pages/api/recommendations.ts`
- `gateways/rpc/Recommendations.gateway.ts`
- `services/ProductCatalog.service.ts`

---

### 8. GET /api/data (广告 API)

**上游操作**: `GET /api/data`

**调用链**:
```
客户端 → GET /api/data?contextKeys=vintage,photography
  → AdGateway.listAds(contextKeys)
    → gRPC AdService/getAds
```

**下游 gRPC 调用**:
- `gRPC AdService/getAds` (1次)

**代码位置**:
- `pages/api/data.ts`
- `gateways/rpc/Ad.gateway.ts`

---

## 关键模式和观察

### 1. ProductCatalogService 是核心依赖

几乎所有的 API 都依赖 `ProductCatalogService`，它负责：
- 获取产品信息
- 处理货币转换

```typescript
// services/ProductCatalog.service.ts
const ProductCatalogService = () => ({
  async getProductPrice(price: Money, currencyCode: string) {
    // 如果不是 USD，调用 CurrencyService 转换
    return currencyCode !== 'USD'
      ? await CurrencyGateway.convert(price, currencyCode)
      : price;
  },
  async listProducts(currencyCode = 'USD') {
    // 1. 获取产品列表
    const { products } = await ProductCatalogGateway.listProducts();
    // 2. 对每个产品转换货币
    return Promise.all(
      products.map(async product => ({
        ...product,
        priceUsd: await this.getProductPrice(product.priceUsd!, currencyCode),
      }))
    );
  },
  async getProduct(id: string, currencyCode = 'USD') {
    // 1. 获取单个产品
    const product = await ProductCatalogGateway.getProduct(id);
    // 2. 转换货币
    return {
      ...product,
      priceUsd: await this.getProductPrice(product.priceUsd!, currencyCode),
    };
  },
});
```

### 2. 货币转换的条件调用

`CurrencyService/convert` 只在货币不是 USD 时调用：

```typescript
async getProductPrice(price: Money, currencyCode: string) {
  return !!currencyCode && currencyCode !== defaultCurrencyCode
    ? await CurrencyGateway.convert(price, currencyCode)  // 调用 gRPC
    : price;  // 直接返回，不调用 gRPC
}
```

这意味着：
- 如果用户选择 USD，不会调用 `CurrencyService/convert`
- 如果用户选择其他货币（如 EUR），每个产品都会调用一次

### 3. 批量并行调用

对于多个产品的货币转换，使用 `Promise.all` 并行执行：

```typescript
// 并行获取所有产品的价格
return Promise.all(
  productList.map(async product => {
    const priceUsd = await this.getProductPrice(product.priceUsd!, currencyCode);
    return { ...product, priceUsd };
  })
);
```

这提高了性能，但也意味着：
- 如果有 10 个产品，会同时发起 10 个 gRPC 调用
- 可能对下游服务造成压力

### 4. 推荐数量限制

推荐 API 限制最多返回 4 个产品：

```typescript
// pages/api/recommendations.ts
const recommendedProductList = await Promise.all(
  productList.slice(0, 4).map(id => 
    ProductCatalogService.getProduct(id, currencyCode as string)
  )
);
```

### 5. 购物车的级联调用

购物车 API 是最复杂的，因为它需要：
1. 获取购物车内容（`CartService/getCart`）
2. 对每个商品获取详细信息（`ProductCatalogService/getProduct`）
3. 对每个商品转换货币（`CurrencyService/convert`）

如果购物车有 5 个商品，且货币是 EUR：
- 1 次 `CartService/getCart`
- 5 次 `ProductCatalogService/getProduct`
- 5 次 `CurrencyService/convert`
- **总计 11 次 gRPC 调用**

## 性能影响分析

### 最坏情况：GET /cart (购物车页面)

假设：
- 购物车有 5 个商品
- 货币是 EUR（非 USD）
- 推荐返回 4 个产品

**gRPC 调用总数**:
```
购物车内容:
  1 × CartService/getCart
  5 × ProductCatalogService/getProduct (购物车商品)
  5 × CurrencyService/convert (购物车商品)

推荐:
  1 × RecommendationService/listRecommendations
  4 × ProductCatalogService/getProduct (推荐商品)
  4 × CurrencyService/convert (推荐商品)

总计: 20 次 gRPC 调用
```

### 优化建议

1. **批量 API**: 创建批量获取产品的 API，减少调用次数
2. **缓存**: 对产品信息和货币转换结果进行缓存
3. **货币转换批量化**: 一次调用转换多个价格
4. **GraphQL**: 使用 GraphQL 让客户端精确指定需要的数据

## 依赖关系矩阵

| 上游操作 | ProductCatalog | Currency | Cart | Recommendation | Ad |
|---------|---------------|----------|------|----------------|-----|
| GET / | listProducts | convert (N) | - | - | - |
| GET /cart | getProduct (M+4) | convert (M+4) | getCart | listRecommendations | - |
| GET /api/products | listProducts | convert (N) | - | - | - |
| GET /api/products/{id} | getProduct | convert | - | - | - |
| GET /api/cart | getProduct (M) | convert (M) | getCart | - | - |
| GET /api/currency | - | getSupportedCurrencies | - | - | - |
| GET /api/recommendations | getProduct (4) | convert (4) | - | listRecommendations | - |
| GET /api/data | - | - | - | - | getAds |

**注释**:
- N = 产品列表数量（通常 10-20）
- M = 购物车商品数量（通常 1-10）
- 数字 4 = 推荐商品限制

## 总结

Frontend 服务的依赖关系呈现以下特点：

1. **ProductCatalogService 是最频繁调用的服务**，几乎所有操作都需要它
2. **CurrencyService 是条件依赖**，只在非 USD 货币时调用
3. **购物车页面是最复杂的场景**，涉及多个服务的级联调用
4. **并行调用模式**提高了性能，但可能增加下游压力
5. **每个上游操作都会触发多个下游 gRPC 调用**，形成扇出模式
