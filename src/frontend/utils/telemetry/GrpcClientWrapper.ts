// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { Client } from '@grpc/grpc-js';
import MessageCollector from './MessageCollector';
import { context, trace } from '@opentelemetry/api';

/**
 * gRPC 客户端包装器，用于在调用前后收集消息内容
 */
export function wrapGrpcClient<T extends Client>(
  client: T,
  serviceName: string
): T {
  const messageCollector = MessageCollector.getInstance();

  return new Proxy(client, {
    get(target, prop, receiver) {
      const originalMethod = Reflect.get(target, prop, receiver);

      // 只包装方法调用
      if (typeof originalMethod !== 'function' || typeof prop !== 'string') {
        return originalMethod;
      }

      // 跳过内部方法
      if (prop.startsWith('_') || ['close', 'getChannel', 'waitForReady'].includes(prop)) {
        return originalMethod;
      }

      return function (request: any, callback?: any, ...args: any[]) {
        const methodName = prop;
        
        // 创建网络调用 span
        const span = messageCollector.createNetworkSpan(
          `gRPC ${serviceName}/${methodName}`, 
          'grpc',
          {
            'rpc.service': serviceName,
            'rpc.method': methodName,
            'rpc.system': 'grpc',
          }
        );

        return context.with(trace.setSpan(context.active(), span), () => {
          // 收集请求消息
          messageCollector.collectGrpcRequest(serviceName, methodName, request);

          // 包装回调函数来收集响应
          const wrappedCallback = (error: any, response: any) => {
            try {
              // 收集响应消息
              messageCollector.collectGrpcResponse(serviceName, methodName, response, error);

              if (error) {
                span.recordException(error);
                span.setAttributes({
                  'rpc.grpc.status_code': error.code || -1,
                });
              } else {
                span.setAttributes({
                  'rpc.grpc.status_code': 0, // OK
                });
              }

              span.end();

              // 调用原始回调
              if (callback) {
                callback(error, response);
              }
            } catch (callbackError) {
              span.recordException(callbackError as Error);
              span.end();
              throw callbackError;
            }
          };

          try {
            // 调用原始方法
            return Reflect.apply(originalMethod, target, [request, wrappedCallback, ...args]);
          } catch (error) {
            span.recordException(error as Error);
            span.end();
            throw error;
          }
        });
      };
    },
  }) as T;
}

/**
 * 创建包装的 Promise 版本的 gRPC 调用
 */
export function createWrappedGrpcCall<TRequest, TResponse>(
  client: any,
  serviceName: string,
  methodName: string
) {
  const messageCollector = MessageCollector.getInstance();

  return (request: TRequest): Promise<TResponse> => {
    return new Promise((resolve, reject) => {
      // 创建网络调用 span
      const span = messageCollector.createNetworkSpan(
        `gRPC ${serviceName}/${methodName}`, 
        'grpc',
        {
          'rpc.service': serviceName,
          'rpc.method': methodName,
          'rpc.system': 'grpc',
        }
      );

      context.with(trace.setSpan(context.active(), span), () => {
        // 收集请求消息
        messageCollector.collectGrpcRequest(serviceName, methodName, request);

        client[methodName](request, (error: any, response: TResponse) => {
          try {
            // 收集响应消息
            messageCollector.collectGrpcResponse(serviceName, methodName, response, error);

            if (error) {
              span.recordException(error);
              span.setAttributes({
                'rpc.grpc.status_code': error.code || -1,
              });
              span.end();
              reject(error);
            } else {
              span.setAttributes({
                'rpc.grpc.status_code': 0, // OK
              });
              span.end();
              resolve(response);
            }
          } catch (callbackError) {
            span.recordException(callbackError as Error);
            span.end();
            reject(callbackError);
          }
        });
      });
    });
  };
}