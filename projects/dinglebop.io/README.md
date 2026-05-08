# dinglebop.io

A small retro click-the-button toy. Counts total bops across all visitors and
shows how many people are online right now.

- **Backend**: Rust + actix-web. A pure `/api/v1/*` microservice — REST + a
  single WebSocket endpoint. Designed for thousands of concurrent sessions
  and horizontally scalable to millions via Redis pub/sub fanout.
- **Frontend**: vanilla HTML/CSS/JS, no build step, peak 1998 aesthetic.
  Served as plain static files (nginx in dev; CDN / static service in
  production).
- **State**: a single Redis instance (AOF persistence assumed).

The Rust binary does **not** serve static files. In production the static
service and the API live behind one ingress (same origin); in local dev
they live on different ports and CORS is allow-listed for the dev origin.

Deployment artefacts (Dockerfile, Helm chart, K8s manifests) live elsewhere
in the parent repo's `gitops/` tree and are out of scope for this crate.

## Layout

```
src/                    Rust sources
  main.rs               binary entry: wires config, redis, server
  lib.rs                shared route configurator (mounts /api/v1)
  config.rs             env-driven Config
  state.rs              AppState (redis + in-process broadcast hub)
  redis_bus.rs          pub/sub subscriber task + click publisher
  presence.rs           heartbeat write, sweeper task, leader lock
  handlers/             HTTP route handlers (click, health, ws)
  ws/                   per-connection WebSocket loop + wire protocol
static/                 frontend: index.html, style.css, app.js
tests/                  integration tests (testcontainers redis)
nginx.conf              local-dev static file server (no API proxying)
docker-compose.yml      local-dev sidecars (redis + nginx)
```

## Run locally

You need a Rust toolchain (1.88+, see `rust-toolchain.toml`), Docker, and
`just` (`cargo install just`).

```sh
just sidecars-up    # start redis (6379) and nginx (8000)
just dev            # cargo run; binary listens on 8080
```

Open `http://localhost:8000` in two browser windows, click the button,
watch both counters update.

The two services run on **separate origins**: nginx serves `static/` on
`http://localhost:8000`, and the Rust backend listens on
`http://localhost:8080`. The frontend learns where the API is via a
`<meta name="dinglebop-api-origin">` tag in `index.html`. CORS on the
backend allow-lists the dev origin (see `CORS_ALLOWED_ORIGINS` in
`.env.example`).

In production the K8s ingress routes both `/` (static) and `/api/v1/*`
(backend) under the same host. Set `dinglebop-api-origin` to empty (or
remove the meta tag) and leave `CORS_ALLOWED_ORIGINS` empty — same-origin,
no CORS needed.

## Configuration

All config is read from environment variables. See `.env.example` — copy
to `.env` for `just`'s `dotenv-load` to pick it up.

| Variable      | Default                       | Notes                                |
| ------------- | ----------------------------- | ------------------------------------ |
| `BIND_ADDR`   | `0.0.0.0:8080`                | Address the HTTP server listens on.  |
| `REDIS_URL`   | `redis://127.0.0.1:6379`      | Standard `redis://` URL.             |
| `LOG_FORMAT`  | `pretty`                      | `pretty` or `json`.                  |
| `RUST_LOG`    | `info`                        | tracing-subscriber `EnvFilter`.      |
| `INSTANCE_ID` | random UUID per process       | Tag for logs and the sweeper lock.   |
| `CORS_ALLOWED_ORIGINS` | empty                | Comma-separated origin allow-list. `*` for any (dev only). |

## HTTP surface

All routes are scoped under `/api/v1`.

| Method | Path                | Purpose                                        |
| ------ | ------------------- | ---------------------------------------------- |
| GET    | `/api/v1/livez`     | always 200; cheap liveness probe               |
| GET    | `/api/v1/healthz`   | 200 if Redis `PING` succeeds within 500ms      |
| GET    | `/api/v1/state`     | `{ clicks, online }` snapshot                  |
| POST   | `/api/v1/click`     | `INCR clicks:total`; broadcasts new count      |
| GET    | `/api/v1/ws`        | WebSocket upgrade for live updates             |

## WebSocket protocol

JSON, tagged enum on the `type` field.

Server → client:
```json
{ "type": "state",  "clicks": 42, "online": 3 }
{ "type": "click",  "clicks": 43 }
{ "type": "online", "online": 4 }
```

Client → server (optional; server ping/pong covers liveness):
```json
{ "type": "heartbeat" }
```

## How concurrency safety works

All click increments go through `INCR clicks:total` — atomic in Redis. After
each increment the instance `PUBLISH`es the new count on `clicks:events`.
Every backend instance subscribes to that channel and forwards events into
an in-process `tokio::sync::broadcast` channel that all live WebSocket
sessions read from. If a publish drops, the next click corrects all clients,
and any client that reconnects fetches the authoritative count via
`/api/v1/state`.

## How presence works

Each WebSocket connection gets a UUID. On connect and every 15s heartbeat,
the server writes `ZADD presence:online <unix_ms> <conn_id>`. A
leader-elected sweeper task (one instance holds a `SET NX EX 30` lock) runs
every 10s, expires entries older than 45s with `ZREMRANGEBYSCORE`, then
publishes the new `ZCARD` count on `presence:events`. Crashed instances leak
nothing — their connections simply stop heartbeating and age out.

## Tests

```sh
just test
```

Integration tests use `testcontainers` to spin up an ephemeral Redis per
run. A running Docker daemon is required.

## Common recipes

```sh
just                # list recipes
just dev            # cargo run (debug)
just run            # cargo run --release
just test           # cargo test (needs Docker)
just clippy         # lint, warnings as errors
just ci             # fmt-check + clippy + test
just sidecars-up    # start redis + nginx
just sidecars-down  # stop redis + nginx
just redis-cli      # open redis-cli against the local-dev container
```
