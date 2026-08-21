# Introduction

`cep-lookup` is a **fault-tolerant CEP resolution engine** - not another API wrapper.

Most CEP libraries solve the happy path: call ViaCEP, return the address, done. The problem shows up in production, when ViaCEP gets slow at 6pm, APICep answers 500 for ten minutes, or your container's network simply disappears. That's the moment your checkout page stops.

This library targets exactly that scenario: it races several providers in parallel, isolates the unstable ones with a circuit breaker, keeps what it already resolved in a cache that outlives the process and, on the last rung, still answers with no network at all.

## The packages

| Package | What it is |
| --- | --- |
| [`@eusilvio/cep-lookup`](https://www.npmjs.com/package/@eusilvio/cep-lookup) | Core engine, framework-agnostic |
| [`@eusilvio/cep-lookup-react`](https://www.npmjs.com/package/@eusilvio/cep-lookup-react) | React hooks and context provider |
| [`@eusilvio/cep-lookup-vue`](https://www.npmjs.com/package/@eusilvio/cep-lookup-vue) | Vue 3 composables |
| [`@eusilvio/zip-lookup`](https://www.npmjs.com/package/@eusilvio/zip-lookup) | US postal codes, same architecture |

All ship at the same version, in ESM and CJS, with types included and `sideEffects: false`.

## The fallback ladder

A call to `lookup()` walks these rungs, in order, until something answers:

```
cache (hit) → coalescing → provider race → retries
   → stale cache (stale-if-error) → offline fallback → error
```

Every rung is optional and turned on by configuration. With nothing configured you get a provider race and nothing else - which already beats a single-provider client.

## When to use it

- **Checkout and signup**: the form cannot freeze because one provider went down.
- **High-volume backends**: a shared Redis cache stops every process from re-resolving the same CEP.
- **Edge/Workers**: KV-backed cache, small bundle, zero dependencies.
- **Batch jobs**: `lookupCeps()` with bounded concurrency and rate limiting.

## When not to use it

If you resolve one CEP a week in an internal script, a plain `fetch` against ViaCEP is fine. The value here is uptime under load, not call ergonomics.

## Compatibility

- Node.js `20.x`, `22.x`, `24.x`
- React `>= 16.8`
- Vue `^3`
- Browser: requires `fetch`, `Promise.any` and `AbortController`

## Next step

[Quick start](/en/guide/quick-start) - install, resolve your first CEP and wire up the recommended production config.
