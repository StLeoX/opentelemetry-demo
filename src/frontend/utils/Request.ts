// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import MessageCollector from './telemetry/MessageCollector';
import { context, trace } from '@opentelemetry/api';

interface IRequestParams {
  url: string;
  body?: object;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  queryParams?: Record<string, any>;
  headers?: Record<string, string>;
}

const request = async <T>({
  url = '',
  method = 'GET',
  body,
  queryParams = {},
  headers = {
    'content-type': 'application/json',
  },
}: IRequestParams): Promise<T> => {
  const messageCollector = MessageCollector.getInstance();
  const fullUrl = `${url}?${new URLSearchParams(queryParams).toString()}`;
  
  // 创建网络调用 span
  const span = messageCollector.createNetworkSpan(`HTTP ${method} ${url}`, 'http', {
    'http.method': method,
    'http.url': fullUrl,
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      // 收集请求消息
      messageCollector.collectHttpRequest(fullUrl, method, headers, body);

      const response = await fetch(fullUrl, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers,
      });

      const responseText = await response.text();
      let responseBody: T | undefined;

      if (!!responseText) {
        responseBody = JSON.parse(responseText);
      }

      // 收集响应消息
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      messageCollector.collectHttpResponse(
        fullUrl, 
        method, 
        response.status, 
        responseHeaders, 
        responseBody
      );

      span.setAttributes({
        'http.status_code': response.status,
        'http.response.size': responseText.length,
      });

      span.end();
      return responseBody as T;
    } catch (error) {
      span.recordException(error as Error);
      span.end();
      throw error;
    }
  });
};

export default request;
