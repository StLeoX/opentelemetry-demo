// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { ListRecommendationsResponse, RecommendationServiceClient } from '../../protos/demo';
import { createWrappedGrpcCall } from '../../utils/telemetry/GrpcClientWrapper';

const { RECOMMENDATION_ADDR = '' } = process.env;

const client = new RecommendationServiceClient(RECOMMENDATION_ADDR, ChannelCredentials.createInsecure());

// 创建包装的 gRPC 调用
const wrappedListRecommendations = createWrappedGrpcCall<{ userId: string; productIds: string[] }, ListRecommendationsResponse>(
  client, 
  'RecommendationService', 
  'listRecommendations'
);

const RecommendationsGateway = () => ({
  listRecommendations(userId: string, productIds: string[]) {
    return wrappedListRecommendations({ userId, productIds });
  },
});

export default RecommendationsGateway();
