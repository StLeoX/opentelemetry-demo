// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { AdResponse, AdServiceClient } from '../../protos/demo';
import { createWrappedGrpcCall } from '../../utils/telemetry/GrpcClientWrapper';

const { AD_ADDR = '' } = process.env;

const client = new AdServiceClient(AD_ADDR, ChannelCredentials.createInsecure());

// 创建包装的 gRPC 调用
const wrappedGetAds = createWrappedGrpcCall<{ contextKeys: string[] }, AdResponse>(
  client, 
  'AdService', 
  'getAds'
);

const AdGateway = () => ({
  listAds(contextKeys: string[]) {
    return wrappedGetAds({ contextKeys: contextKeys });
  },
});

export default AdGateway();
