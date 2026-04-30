# Support Policy

## Runtime support

`cep-lookup` aims to support maintained Node.js LTS/current lines used in CI:

- Node.js 20.x
- Node.js 22.x
- Node.js 24.x

Browser support depends on availability of:

- `fetch`
- `Promise.any`
- `AbortController`

If your target environment lacks these APIs, use compatible polyfills.

## Package compatibility

- `@eusilvio/cep-lookup-react`: React >= 16.8.
- `@eusilvio/cep-lookup-vue`: Vue 3.x.

## Maintenance levels

- Latest major: full support (features, bug fixes, security updates).
- Previous major: security fixes only, at maintainer discretion.
- Older majors: unsupported.

## Support channels

- Bug reports and feature requests: GitHub Issues.
- Security concerns: follow `SECURITY.md`.
