# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`vym.fyi` is a tiny, API-only, multi-tenant URL shortener written in Rust. There is intentionally **no web UI** — only an HTTP API and a CLI. It ships as two services that share a Postgres database but use different roles:

- **`vym-fyi-server-crud`** — read/write API for creating and listing short links. API-key protected, multi-tenant. Runs migrations and syncs tenants on startup.
- **`vym-fyi-server-redirect`** — latency-focused, read-only redirector that resolves `/{slug}` and issues a 307 redirect.

## Commands

```bash
# Build / typecheck the whole workspace
cargo check --all-targets --all-features

# Run all tests (needs NO Postgres — every test is a unit test: config resolution, strategy stubs, query adapter, HTTP client)
cargo test --workspace --all-targets

# Run a single test by name (substring match)
cargo test -p vym-fyi-model resolves_env_placeholders

# Lint (CI treats warnings as errors)
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt --all          # or `cargo fmt -- --check` to verify only

# Coverage (recommended >=70%)
cargo llvm-cov --workspace --all-features --fail-under-lines 70

# Dependency/license/advisory audit (matches CI SAST job)
cargo deny check advisories
cargo deny check bans licenses sources

# Run services locally (need a reachable Postgres)
DATABASE_URL=postgres://... TENANTS_CONFIG_PATH=.docker/tenants.yaml cargo run -p vym-fyi-server-crud
DATABASE_URL_RO=postgres://... cargo run -p vym-fyi-server-redirect

# Run the CLI client
cargo run -p vym-fyi-client -- --config config.yaml --client client-a ping

# Full stack (Postgres + both services + Prometheus/Grafana) via the multi-stage Dockerfile
docker compose up --build
```

`pre-commit` runs `cargo check`, `cargo fmt --all`, and `cargo clippy -D warnings` on Rust changes. The CI workflow (`.github/workflows/ci.yml`) additionally runs super-linter (YAML, GitHub Actions, gitleaks, trivy) and `cargo-deny`.

## Workspace layout

Cargo workspace (edition 2024, `resolver = "3"`). Shared deps are pinned in the root `Cargo.toml` `[workspace.dependencies]`; crate manifests reference them with `.workspace = true`. There is a custom `prod` profile (`lto`, `opt-level = "z"`, `strip`) used for release container builds.

- **`vym-fyi-model`** — the shared core library. Almost all logic that is not HTTP-handler-specific lives here: DB repositories, config loading, slug generation, the singleton HTTP client, Axum metrics middleware, static-asset serving, the error type, and domain models. Both servers, the CLI, and the Node binding depend on it.
- **`vym-fyi-server-crud`** — CRUD API binary. Owns migrations (`migrations/`), API-key auth, and link handlers.
- **`vym-fyi-server-redirect`** — redirect API binary.
- **`vym-fyi-client`** — Clap-based CLI that calls the CRUD API over HTTP.
- **`vym-fyi-node`** — N-API (`napi` v3) `cdylib` exposing `ping` / `create_link` / `list_links` to Node.js, calling the CRUD API over HTTP.
- **`vym-fyi-healthcheck`** — dependency-free static binary that does a raw TCP `GET /health`; used as the container `HEALTHCHECK`.

## Architecture & key patterns

The codebase deliberately applies a small set of named patterns; preserve them when extending:

- **Facade + Builder** — `CrudApp`/`CrudAppBuilder` ([crates/vym-fyi-server-crud/src/app.rs](crates/vym-fyi-server-crud/src/app.rs)) and `RedirectApp`/`RedirectAppBuilder` ([crates/vym-fyi-server-redirect/src/app.rs](crates/vym-fyi-server-redirect/src/app.rs)) wrap the DB pool + repositories. The app struct is the Axum router `State` (it is `Clone`). Builders read config from env (`from_env`) and `build()` is where the pool is created and (for CRUD) migrations run and tenants sync.
- **Abstract Factory** — `RepositoryFactory` trait + `PgRepositoryFactory` ([crates/vym-fyi-model/src/services/repos.rs](crates/vym-fyi-model/src/services/repos.rs)) hand out `TenantRepository` / `ShortLinkRepository`. Apps hold `Arc<dyn RepositoryFactory>`.
- **Strategy** — link creation in [crates/vym-fyi-server-crud/src/handlers/links.rs](crates/vym-fyi-server-crud/src/handlers/links.rs): `ProvidedSlugStrategy` (upsert) vs `GeneratedSlugStrategy` (random slug with collision retry), chosen by whether the request supplies a slug. The handler defines a local `LinkRepository` trait so strategies can be unit-tested with a stub.
- **Adapter** — `LinkListQueryAdapter` + `QueryParamsBuilder` ([crates/vym-fyi-model/src/services/query_adapter.rs](crates/vym-fyi-model/src/services/query_adapter.rs)) centralize turning list-filter DTOs into HTTP query params; implemented by both the CLI's `LinksListParams` and the Node binding's `ListLinksInput`.
- **Singleton** — `HttpClient::global()` ([crates/vym-fyi-model/src/services/http_client.rs](crates/vym-fyi-model/src/services/http_client.rs)) is a `once_cell::Lazy` shared `reqwest` client with tuned pools/timeouts. CLI and Node binding use it; do not build ad-hoc clients.

### Cross-cutting conventions

- **Errors**: single `AppError` enum + `AppResult<T>` alias in [crates/vym-fyi-model/src/models/errors.rs](crates/vym-fyi-model/src/models/errors.rs), with `#[from]` conversions. Axum handlers map `AppError` to `StatusCode` (e.g. `Conflict` → 409, missing tenant → 403).
- **Auth** (CRUD only): `ApiKeyAuth` is an Axum `FromRequestParts` extractor ([crates/vym-fyi-server-crud/src/auth.rs](crates/vym-fyi-server-crud/src/auth.rs)). Keys come via `X-API-Key` or `Authorization: ApiKey <key>`, plus `X-Client-Id`. The master key authenticates globally (`is_master`); per-client keys require a matching `X-Client-Id`. Comparison is constant-time (`ApiKeyStore::authenticate`).
- **Tenancy**: API keys and bindings are derived from a YAML config (`config.yaml` / `.docker/tenants.yaml`) at startup, **not** the DB `api_keys` table. On boot, CRUD syncs the `tenants` table to match the config (creates missing, deletes extras). Non-master callers are scoped to their `tenant_id`; master sees all rows.
- **Config env placeholders**: config values like `api_key: "$(CLIENT_A_SECRET)"` are resolved against environment variables by `resolve_env_placeholders` ([crates/vym-fyi-model/src/services/config.rs](crates/vym-fyi-model/src/services/config.rs)). A missing var is a hard error.
- **Migrations**: embedded via `sqlx::migrate!()` and run automatically by `CrudAppBuilder::build()`. Add new files under [crates/vym-fyi-server-crud/migrations/](crates/vym-fyi-server-crud/migrations/). Note `sqlx` uses runtime-checked queries (`sqlx::query(...).bind(...)`), not the compile-time `query!` macros, so no `DATABASE_URL` is needed at build time.
- **Observability**: both servers expose Prometheus `/metrics` and add per-IP/per-request metrics via `record_ip_metrics` middleware ([crates/vym-fyi-model/src/services/axum_metrics.rs](crates/vym-fyi-model/src/services/axum_metrics.rs)). `/health` and `/metrics` are excluded from request metrics. Redirect buckets slug-length labels to bound cardinality. Logging is `tracing` + `RUST_LOG` env filter (`setup_logging`).
- **Static assets**: shared 404/500 pages and `/static/*` + `/favicon.ico` routes come from `static_assets` ([crates/vym-fyi-model/src/services/static_assets.rs](crates/vym-fyi-model/src/services/static_assets.rs)); files live in [static/](static/) and are served relative to the process working directory.
- Both server binaries use **mimalloc** as the global allocator and bind via `bind_addr_from_env` (`ADDRESS`/`PORT`, default port 8000).

### Key environment variables

- CRUD: `DATABASE_URL` (required), `TENANTS_CONFIG_PATH` (optional — without it, no tenants/keys are loaded and the API is effectively locked down).
- Redirect: `DATABASE_URL_RO` (required).
- Both: `ADDRESS`, `PORT`, `RUST_LOG`.
- Healthcheck binary: `HOST`, `PORT`, `HEALTH_PATH`, `HEALTH_TIMEOUT_MS` (or `--host/--port/--path/--timeout-ms` flags).

## Deployment

The multi-stage [Dockerfile](Dockerfile) cross-compiles to musl (static, distroless `nonroot` images) producing `vym-fyi-crud`, `vym-fyi-redirect`, and `healthcheck` binaries. Helm charts for both services live under [charts/](charts/). Local dev stack (Postgres, both services, Prometheus, Grafana dashboards) is [compose.yaml](compose.yaml) + [.docker/](.docker/).

## Linked instruction file

`AGENTS.md` is a symlink to this file — one source of truth shared by Claude Code and OpenCode. Edit this file only; never replace `AGENTS.md` with a regular file.
