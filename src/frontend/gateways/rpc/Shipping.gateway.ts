// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { Address, CartItem, GetQuoteResponse, ShippingServiceClient } from '../../protos/demo';
import { createWrappedGrpcCall } from '../../utils/telemetry/GrpcClientWrapper';

const { SHIPPING_ADDR = '' } = process.env;

const client = new ShippingServiceClient(SHIPPING_ADDR, ChannelCredentials.createInsecure());

// 创建包装的 gRPC 调用
const wrappedGetQuote = createWrappedGrpcCall<{ items: CartItem[]; address: Address }, GetQuoteResponse>(
  client, 
  'ShippingService', 
  'getQuote'
);

const ShippingGateway = () => ({
  getShippingCost(itemList: CartItem[], address: Address) {
    return wrappedGetQuote({ items: itemList, address: address });
  },
});

export default ShippingGateway();
