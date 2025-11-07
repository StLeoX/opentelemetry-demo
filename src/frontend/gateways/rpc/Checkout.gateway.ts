// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { CheckoutServiceClient, PlaceOrderRequest, PlaceOrderResponse } from '../../protos/demo';
import { createWrappedGrpcCall } from '../../utils/telemetry/GrpcClientWrapper';

const { CHECKOUT_ADDR = '' } = process.env;

const client = new CheckoutServiceClient(CHECKOUT_ADDR, ChannelCredentials.createInsecure());

// 创建包装的 gRPC 调用
const wrappedPlaceOrder = createWrappedGrpcCall<PlaceOrderRequest, PlaceOrderResponse>(
  client, 
  'CheckoutService', 
  'placeOrder'
);

const CheckoutGateway = () => ({
  placeOrder(order: PlaceOrderRequest) {
    return wrappedPlaceOrder(order);
  },
});

export default CheckoutGateway();
