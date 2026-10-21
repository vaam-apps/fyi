---
layout: home
title: vym.fyi

hero:
  name: vym.fyi
  text: A tiny, API-only URL shortener
  tagline: Multi-tenant short links in Rust — an HTTP API and a CLI, deliberately no web UI.
  image:
    src: /logo.svg
    alt: vym.fyi
  actions:
    - theme: brand
      text: Developer guide
      link: /README
    - theme: alt
      text: Architecture
      link: /arc42
    - theme: alt
      text: GitHub
      link: https://github.com/vaam-apps/fyi

features:
  - title: Two small services
    details: vym-fyi-server-crud creates and lists short links on a read/write database role; vym-fyi-server-redirect resolves /{slug} on a read-only role and answers with a 307.
  - title: Multi-tenant API keys
    details: Callers authenticate with X-API-Key (or Authorization ApiKey) plus X-Client-Id. Tenants come from a YAML file that the CRUD server syncs on startup; an optional master key sees every tenant.
  - title: API and CLI only
    details: No dashboard to host. Manage links over HTTP, with the vym-fyi-client CLI, or from Node.js through the vym-fyi-node binding.
  - title: Observable
    details: Both services expose Prometheus /metrics, and the Docker Compose stack provisions Grafana dashboards generated from code.
---

## Docs at a glance

vymalo for your information is a small, multi-tenant URL shortener built in
Rust. Use this site as the entry point for working with the codebase and
understanding how the services fit together.

- [Developer guide](./README.md): local setup, running the services, CLI usage,
  metrics and dashboards.
- [Architecture (arc42)](./arc42.md): system context, design decisions, and
  deployment model.

## Running the docs locally

The site is a [VitePress](https://vitepress.dev) project in `docs/`, themed
with `@vaam-apps/vitepress-md3`. It needs Node.js 22.12 or newer and pnpm 12.

```bash
cd docs
pnpm install
pnpm dev   # live reload
pnpm build # static site in docs/.vitepress/dist
```

## Design patterns in the app layer

- Strategy: `ProvidedSlugStrategy` and `GeneratedSlugStrategy` choose how slugs
  are created in `crates/vym-fyi-server-crud/src/handlers/links.rs`.
- Facade: `CrudApp` and `RedirectApp` wrap the DB pool, repository factory, and
  API-key state (`crates/vym-fyi-server-crud/src/app.rs`,
  `crates/vym-fyi-server-redirect/src/app.rs`).
- Factory: `PgRepositoryFactory` implements the `RepositoryFactory` interface to
  provide database-backed repositories
  (`crates/vym-fyi-model/src/services/repos.rs`).
- Adapter: `LinkListQueryAdapter` with `QueryParamsBuilder` converts list inputs
  into HTTP query params for both the CLI and Node bindings
  (`crates/vym-fyi-model/src/services/query_adapter.rs`).
- Singleton: `HttpClient::global` exposes a shared HTTP client for reuse across
  crates (`crates/vym-fyi-model/src/services/http_client.rs`).

## Tests and coverage

- Unit tests live alongside services (config placeholder resolution, query
  adapter, HTTP client singleton, link strategies) and run with
  `cargo test --workspace --all-targets`.
- Integration tests validate configuration loading and env resolution at
  `crates/vym-fyi-model/tests/config_flow.rs`.
- CI runs the test suite on every push/PR via `.github/workflows/ci.yml`.
- To measure coverage locally, run
  `cargo llvm-cov --workspace --all-features --fail-under-lines 70` (70%+
  recommended) and publish the generated report if needed.
