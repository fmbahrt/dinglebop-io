FROM rust:1-bookworm AS builder
WORKDIR /app
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked --bin dinglebop

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/dinglebop /usr/local/bin/dinglebop
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/dinglebop"]
