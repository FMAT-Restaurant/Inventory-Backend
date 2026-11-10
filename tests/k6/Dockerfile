# Imagen de k6 con la extensión AMQP usada por las pruebas de eventos.
# La extensión oficial está archivada, por eso se pinea la última versión
# publicada junto con una versión compatible de k6.
# Se usa Go 1.21 (contemporáneo a k6 v0.45.1) en lugar de la imagen
# grafana/xk6:latest, que ya requiere Go 1.26 y puede fallar al compilar k6 viejo.
FROM golang:1.21-bookworm AS builder

ARG K6_VERSION=v0.45.1
ARG XK6_VERSION=v0.10.0
ARG XK6_AMQP_VERSION=v0.4.1

RUN GOBIN=/usr/local/bin go install "go.k6.io/xk6/cmd/xk6@${XK6_VERSION}"

WORKDIR /xk6
RUN xk6 build "${K6_VERSION}" \
    --with "github.com/grafana/xk6-amqp@${XK6_AMQP_VERSION}" \
    --output /xk6/k6

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /xk6/k6 /usr/local/bin/k6
COPY tests/k6 /scripts

WORKDIR /scripts
ENTRYPOINT ["k6"]
