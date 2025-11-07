// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { ListProductsResponse, Product, ProductCatalogServiceClient } from '../../protos/demo';
import { createWrappedGrpcCall } from '../../utils/telemetry/GrpcClientWrapper';

const { PRODUCT_CATALOG_ADDR = '' } = process.env;

const client = new ProductCatalogServiceClient(PRODUCT_CATALOG_ADDR, ChannelCredentials.createInsecure());

// 创建包装的 gRPC 调用
const wrappedListProducts = createWrappedGrpcCall<{}, ListProductsResponse>(
  client, 
  'ProductCatalogService', 
  'listProducts'
);

const wrappedGetProduct = createWrappedGrpcCall<{ id: string }, Product>(
  client, 
  'ProductCatalogService', 
  'getProduct'
);

const ProductCatalogGateway = () => ({
  listProducts() {
    return wrappedListProducts({});
  },
  getProduct(id: string) {
    return wrappedGetProduct({ id });
  },
});

export default ProductCatalogGateway();
