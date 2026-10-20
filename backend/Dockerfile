# syntax=docker/dockerfile:1
FROM rust:1.85-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
# Cache deps with a dummy main
RUN mkdir src && echo "fn main() {}" > src/main.rs \
 && cargo build --release \
 && rm -rf src
COPY migrations ./migrations
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/sahel-api /usr/local/bin/sahel-api
ENV BIND_ADDR=0.0.0.0:8080
EXPOSE 8080
CMD ["sahel-api"]
