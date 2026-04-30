# Contributing

Thanks for contributing to `cep-lookup`.

## Development setup

1. Fork and clone the repository.
2. Use Node.js 20, 22, or 24.
3. Install dependencies:

```bash
npm ci
```

4. Build all packages:

```bash
npm run build
```

5. Run tests:

```bash
npm test
```

## Repository structure

- `packages/cep-lookup`: core library.
- `packages/cep-lookup-react`: React bindings.
- `packages/cep-lookup-vue`: Vue bindings.

## Branching and pull requests

1. Create a branch from `main`.
2. Keep changes scoped and atomic.
3. Add or update tests when behavior changes.
4. Open a PR with:
- What changed.
- Why it changed.
- How it was tested.

## Commit messages

Use clear, imperative commit messages. Examples:

- `fix(core): handle provider timeout race`
- `feat(react): add bulk remap on mapper change`
- `docs: clarify support policy`

## Changesets and versioning

This repository uses Changesets for releases.

When your change affects package behavior, public API, or docs relevant to users:

```bash
npm run changeset
```

Choose the correct bump type (`patch`, `minor`, `major`) and provide a short summary.

## Code quality expectations

- Keep TypeScript strictness intact.
- Avoid breaking API compatibility without explicit major versioning.
- Prefer focused changes over broad refactors.
- Preserve framework-agnostic behavior in the core package.

## Reporting security issues

Do not open public issues for security vulnerabilities.
Use the process documented in `SECURITY.md`.
