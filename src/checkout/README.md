# Checkout Service

This service provides checkout services for the application.

## Local Build

To build the service binary, run:

```sh
go build -o /go/bin/checkout/
```

## Docker Build

From the root directory, run:

```sh
docker compose build checkout
```

## Regenerate protos

To build the protos, run from the root directory:

```sh
make docker-generate-protobuf
```

## Bump dependencies

To bump all dependencies run:

```sh
go get -u -t ./...
go mod tidy
```

## Local Docker Build

```
go generate
go build -o checkout .
docker build -f Dockerfile.local -t 1.94.151.57:85/open-telemetry/checkout:cbt .
docker push 1.94.151.57:85/open-telemetry/checkout:cbt
```
