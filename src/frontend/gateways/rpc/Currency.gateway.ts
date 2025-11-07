// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { GetSupportedCurrenciesResponse, CurrencyServiceClient, Money } from '../../protos/demo';
import { createWrappedGrpcCall } from '../../utils/telemetry/GrpcClientWrapper';

const { CURRENCY_ADDR = '' } = process.env;

const client = new CurrencyServiceClient(CURRENCY_ADDR, ChannelCredentials.createInsecure());

// 创建包装的 gRPC 调用
const wrappedConvert = createWrappedGrpcCall<{ from: Money; toCode: string }, Money>(
  client, 
  'CurrencyService', 
  'convert'
);

const wrappedGetSupportedCurrencies = createWrappedGrpcCall<{}, GetSupportedCurrenciesResponse>(
  client, 
  'CurrencyService', 
  'getSupportedCurrencies'
);

const CurrencyGateway = () => ({
  convert(from: Money, toCode: string) {
    return wrappedConvert({ from, toCode });
  },
  getSupportedCurrencies() {
    return wrappedGetSupportedCurrencies({});
  },
});

export default CurrencyGateway();
