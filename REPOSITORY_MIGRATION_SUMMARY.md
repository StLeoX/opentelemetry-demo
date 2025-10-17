# OpenTelemetry Demo 仓库迁移总结

## 概述

将项目从 `open-telemetry/opentelemetry-demo` 迁移到 `stleox/opentelemetry-demo`，涉及多个文件中的仓库引用和镜像名称更新。

## 修改的文件和内容

### 1. GitHub Actions 工作流

#### `.github/workflows/build-images.yml`
- 更新仓库检查条件：`github.repository == 'stleox/opentelemetry-demo'`

#### `.github/workflows/component-build-images.yml`
- 更新默认 GHCR 仓库：`ghcr.io/stleox/demo`

#### `.github/workflows/release.yml`
- 更新仓库检查条件：`github.repository == 'stleox/opentelemetry-demo'`

#### `.github/workflows/nightly-release.yml`
- 更新仓库检查条件：`github.repository == 'stleox/opentelemetry-demo'`

#### `.github/workflows/assign-reviewers.yml`
- 更新仓库检查条件：`github.repository == 'stleox/opentelemetry-demo'`

### 2. 环境配置

#### `.env`
- 更新镜像名称：`IMAGE_NAME=ghcr.io/stleox/demo`

### 3. Kubernetes 配置

#### `kubernetes/opentelemetry-demo.yaml`
- 批量替换所有镜像引用：`ghcr.io/open-telemetry/demo:` → `ghcr.io/stleox/demo:`
- 涉及所有服务的镜像引用（accounting, ad, cart, checkout, currency, email, 等）

### 4. Go 模块更新

#### `src/checkout/go.mod`
- 更新模块路径：`github.com/stleox/opentelemetry-demo/src/checkout`

#### `src/checkout/main.go`
- 更新导入路径：
  - `github.com/stleox/opentelemetry-demo/src/checkout/genproto/oteldemo`
  - `github.com/stleox/opentelemetry-demo/src/checkout/kafka`
  - `github.com/stleox/opentelemetry-demo/src/checkout/money`

#### `src/checkout/money/money.go`
- 更新导入路径：`github.com/stleox/opentelemetry-demo/src/checkout/genproto/oteldemo`

#### `src/checkout/money/money_test.go`
- 更新导入路径：`github.com/stleox/opentelemetry-demo/src/checkout/genproto/oteldemo`

#### `src/product-catalog/go.mod`
- 更新模块路径：`github.com/stleox/opentelemetry-demo/src/product-catalog`

#### `internal/tools/go.mod`
- 更新模块路径：`github.com/stleox/opentelemetry-demo/internal/tools`

### 5. 构建配置

#### `Makefile`
- 更新 Helm 仓库引用：`stleox/opentelemetry-demo`

## 影响的服务

以下服务的容器镜像引用已更新：
- accounting
- ad
- cart
- checkout
- currency
- email
- flagd-ui
- fraud-detection
- frontend
- frontend-proxy
- image-provider
- kafka
- load-generator
- payment
- postgresql
- product-catalog
- quote
- recommendation
- shipping

## 验证步骤

1. **代码编译检查**：所有 Go 模块编译无错误
2. **镜像构建**：GitHub Actions 工作流将使用新的仓库名称
3. **部署配置**：Kubernetes 和 Docker Compose 将使用新的镜像引用

## 注意事项

1. **镜像推送权限**：确保 `stleox` 用户有权限推送到 `ghcr.io/stleox/demo`
2. **Helm Chart**：如果使用 Helm 部署，需要确保 `stleox/opentelemetry-demo` Helm 仓库存在
3. **依赖更新**：运行 `go mod tidy` 更新 Go 模块依赖
4. **CI/CD 配置**：确保新仓库的 GitHub Actions 有必要的 secrets 配置

## 后续步骤

1. 提交所有更改到新仓库
2. 配置 GitHub Actions secrets（DOCKER_USERNAME, DOCKER_PASSWORD 等）
3. 测试镜像构建和推送流程
4. 更新文档中的仓库引用（如需要）