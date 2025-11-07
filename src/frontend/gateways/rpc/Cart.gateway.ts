// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { Cart, CartItem, CartServiceClient, Empty } from '../../protos/demo';
import { createWrappedGrpcCall } from '../../utils/telemetry/GrpcClientWrapper';

const { CART_ADDR = '' } = process.env;

const client = new CartServiceClient(CART_ADDR, ChannelCredentials.createInsecure());

// 创建包装的 gRPC 调用
const wrappedGetCart = createWrappedGrpcCall<{ userId: string }, Cart>(
  client, 
  'CartService', 
  'getCart'
);

const wrappedAddItem = createWrappedGrpcCall<{ userId: string; item: CartItem }, Empty>(
  client, 
  'CartService', 
  'addItem'
);

const wrappedEmptyCart = createWrappedGrpcCall<{ userId: string }, Empty>(
  client, 
  'CartService', 
  'emptyCart'
);

const CartGateway = () => ({
  getCart(userId: string) {
    return wrappedGetCart({ userId });
  },
  addItem(userId: string, item: CartItem) {
    return wrappedAddItem({ userId, item });
  },
  emptyCart(userId: string) {
    return wrappedEmptyCart({ userId });
  },
});

export default CartGateway();
