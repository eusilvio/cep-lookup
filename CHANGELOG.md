# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2025-10-10

### Added
- **Strict CEP Validation**: Input validation now strictly requires the `NNNNNNNN` or `NNNNN-NNN` format, rejecting any other pattern.
- **Rate Limiting**: Implemented a configurable in-memory rate limiter to prevent API abuse. This can be configured via the `rateLimit` option in the `CepLookup` constructor.
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
