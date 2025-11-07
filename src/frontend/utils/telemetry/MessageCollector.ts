// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { trace, context, SpanKind } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

interface NetworkMessage {
  direction: 'outbound' | 'inbound';
  protocol: 'http' | 'grpc';
  method?: string;
  url?: string;
  service?: string;
  rpcMethod?: string;
  headers?: Record<string, string>;
  body?: any;
  timestamp: number;
  size?: number;
}

class MessageCollector {
  private static instance: MessageCollector;
  private tracer = trace.getTracer('frontend-message-collector');

  static getInstance(): MessageCollector {
    if (!MessageCollector.instance) {
      MessageCollector.instance = new MessageCollector();
    }
    return MessageCollector.instance;
  }

  /**
   * 收集 HTTP 请求消息
   */
  collectHttpRequest(url: string, method: string, headers: Record<string, string>, body?: any): void {
    const message: NetworkMessage = {
      direction: 'outbound',
      protocol: 'http',
      method,
      url,
      headers,
      body,
      timestamp: Date.now(),
      size: body ? JSON.stringify(body).length : 0,
    };

    this.recordMessage(message, 'http.request');
  }

  /**
   * 收集 HTTP 响应消息
   */
  collectHttpResponse(url: string, method: string, status: number, headers: Record<string, string>, body?: any): void {
    const message: NetworkMessage = {
      direction: 'inbound',
      protocol: 'http',
      method,
      url,
      headers: { ...headers, 'http.status_code': status.toString() },
      body,
      timestamp: Date.now(),
      size: body ? JSON.stringify(body).length : 0,
    };

    this.recordMessage(message, 'http.response');
  }

  /**
   * 收集 gRPC 请求消息
   */
  collectGrpcRequest(service: string, method: string, request: any): void {
    const message: NetworkMessage = {
      direction: 'outbound',
      protocol: 'grpc',
      service,
      rpcMethod: method,
      body: request,
      timestamp: Date.now(),
      size: JSON.stringify(request).length,
    };

    this.recordMessage(message, 'grpc.request');
  }

  /**
   * 收集 gRPC 响应消息
   */
  collectGrpcResponse(service: string, method: string, response: any, error?: Error): void {
    const message: NetworkMessage = {
      direction: 'inbound',
      protocol: 'grpc',
      service,
      rpcMethod: method,
      body: error ? { error: error.message } : response,
      timestamp: Date.now(),
      size: JSON.stringify(error ? { error: error.message } : response).length,
    };

    this.recordMessage(message, 'grpc.response');
  }

  /**
   * 记录消息到 OpenTelemetry span
   */
  private recordMessage(message: NetworkMessage, eventName: string): void {
    const span = trace.getActiveSpan();
    if (!span) return;

    // 添加消息事件
    span.addEvent(eventName, {
      'message.direction': message.direction,
      'message.protocol': message.protocol,
      'message.timestamp': message.timestamp,
      'message.size': message.size || 0,
      ...(message.method && { 'http.method': message.method }),
      ...(message.url && { 'http.url': message.url }),
      ...(message.service && { 'rpc.service': message.service }),
      ...(message.rpcMethod && { 'rpc.method': message.rpcMethod }),
    });

    // 添加消息内容作为属性（截断长内容）
    if (message.body) {
      const bodyStr = typeof message.body === 'string' ? message.body : JSON.stringify(message.body);
      const truncatedBody = bodyStr.length > 1000 ? bodyStr.substring(0, 1000) + '...' : bodyStr;
      span.setAttribute(`message.${message.direction}.body`, truncatedBody);
    }

    // 添加头部信息
    if (message.headers) {
      Object.entries(message.headers).forEach(([key, value]) => {
        // 过滤敏感头部
        if (!this.isSensitiveHeader(key)) {
          span.setAttribute(`message.${message.direction}.header.${key}`, value);
        }
      });
    }
  }

  /**
   * 检查是否为敏感头部信息
   */
  private isSensitiveHeader(headerName: string): boolean {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
    ];
    return sensitiveHeaders.includes(headerName.toLowerCase());
  }

  /**
   * 创建网络调用的 span
   */
  createNetworkSpan(name: string, protocol: 'http' | 'grpc', attributes: Record<string, any> = {}) {
    return this.tracer.startSpan(name, {
      kind: SpanKind.CLIENT,
      attributes: {
        'network.protocol': protocol,
        ...attributes,
      },
    });
  }
}

export default MessageCollector;