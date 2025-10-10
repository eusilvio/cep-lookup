# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.1] - 2025-10-10

### Fixed
- **Single Provider Rejection**: Fixed an issue where `lookup` would throw an `AggregateError` when a single provider failed, instead of the expected `Error`. The logic now awaits the promise directly in single-provider scenarios, ensuring consistent error handling.

## [2.0.0] - 2025-10-10

### BREAKING CHANGE
- **Strict CEP Validation**: Input validation now strictly requires the CEP to be in the `NNNNNNNN` or `NNNNN-NNN` format. Any other format will now throw an error, which may break integrations that were passing unclean CEP strings.

### Added
- **Observability Events API**: The `CepLookup` class now emits `success`, `failure`, and `cache:hit` events, allowing users to build robust metrics and monitoring systems.
- **Rate Limiting**: Implemented a configurable in-memory rate limiter to prevent API abuse. This can be configured via the `rateLimit` option in the `CepLookup` constructor.

### Changed
- **Data Sanitization**: All string fields in the returned address object are now automatically trimmed of leading/trailing whitespace to improve data quality.

### Fixed
- **NPM License Display**: Added the `license: "MIT"` field to `package.json` to ensure the license is correctly displayed on npmjs.com.

## [1.3.0] - 2025-10-10

### Added
- **Bulk CEP Lookup**: Introduced the `lookupCeps` function to look up multiple CEPs efficiently in a single call.
- **Controlled Concurrency**: The bulk lookup feature uses a native worker pool to control the number of parallel requests to providers.

### Changed
- The CI/CD pipeline was updated to a more secure, tag-based release process using OIDC provenance for publishing to NPM.

### Fixed
- The `repository` field was added to `package.json` to support NPM's provenance verification.

### Docs
- Updated `README.md` with documentation for the new bulk lookup feature.
- Added `examples/bulk-example.ts`.
- Standardized imports in all example files to use the package name.
- Removed unused `axios` dependency from examples.