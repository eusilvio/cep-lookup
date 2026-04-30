# Changelog

## 0.3.1

### Patch Changes

- 671f9cd: Improve open-source project readiness with governance docs, release automation, CI hardening, and documentation updates.

  Also includes runtime and testing quality improvements:

  - fix Jest workspace module resolution for React and Vue packages
  - improve React provider cache scoping and bulk hook mapper remapping behavior
  - apply `staggerDelay` support in Vue hook options
  - refine core timeout typing for better cross-environment compatibility

- Updated dependencies [671f9cd]
  - @eusilvio/cep-lookup@2.5.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2025-12-30

### Added

- **Smart Warmup**: The `useCepLookup` hook now exposes the `warmup` function.
- **Stagger Delay Configuration**: The hook options now accept `staggerDelay` to tune the race strategy.

## [0.2.2] - 2025-12-30

### Fixed

- **Package Metadata**: Fixed missing repository and homepage URLs.
