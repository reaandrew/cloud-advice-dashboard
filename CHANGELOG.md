## [1.4.0](https://github.com/reaandrew/cloud-advice-dashboard/compare/v1.3.0...v1.4.0) (2026-02-06)

### Features

* add granular feature flags for compliance navigation, routes an… ([#29](https://github.com/reaandrew/cloud-advice-dashboard/issues/29)) ([1ee1ceb](https://github.com/reaandrew/cloud-advice-dashboard/commit/1ee1ceb9e2c8061c1314edc99985ba011f00a77f))

## [1.3.0](https://github.com/reaandrew/cloud-advice-dashboard/compare/v1.2.0...v1.3.0) (2026-01-29)

### Features

* show only Load Balancers in compliance navigation ([#28](https://github.com/reaandrew/cloud-advice-dashboard/issues/28)) ([b82fe76](https://github.com/reaandrew/cloud-advice-dashboard/commit/b82fe762b687cae7fb67aa67e64851a03c4a35be))

## [1.2.0](https://github.com/reaandrew/cloud-advice-dashboard/compare/v1.1.0...v1.2.0) (2026-01-29)

### Features

* **compliance:** exclude TCP/UDP-only NLBs from TLS certificate checks ([#26](https://github.com/reaandrew/cloud-advice-dashboard/issues/26)) ([4c3f418](https://github.com/reaandrew/cloud-advice-dashboard/commit/4c3f4186bcf9fbb7bdb7012e0a4aa952eca4dd38))

## [1.1.0](https://github.com/reaandrew/cloud-advice-dashboard/compare/v1.0.0...v1.1.0) (2025-11-10)

### Features

* add teams/tenants compliance views and mobile responsive design ([#18](https://github.com/reaandrew/cloud-advice-dashboard/issues/18)) ([0103e75](https://github.com/reaandrew/cloud-advice-dashboard/commit/0103e75c05838ee0db75dcb3226d0729c843d300))

## 1.0.0 (2025-10-07)

### Features

* add active navigation states and overview page ([ba121e3](https://github.com/reaandrew/cloud-advice-dashboard/commit/ba121e3deef75611c0bfda044e0ac4797775c04a))
* add authorization middleware and scoped all queries based off a generic implementation ([#3](https://github.com/reaandrew/cloud-advice-dashboard/issues/3)) ([88f37dc](https://github.com/reaandrew/cloud-advice-dashboard/commit/88f37dca5d9766bee56e8745f70ea9a3af9bd788))
* add comprehensive error handling with 404 and 500 pages ([d4f9a10](https://github.com/reaandrew/cloud-advice-dashboard/commit/d4f9a10d9adbcbd14770759b43b215c940d91921))
* Add config loader ([232de7d](https://github.com/reaandrew/cloud-advice-dashboard/commit/232de7d42addae8435bd5a43a6ecd656c1c3007b))
* Add Config Skeleton ([9f080b5](https://github.com/reaandrew/cloud-advice-dashboard/commit/9f080b5133558391d05f530a41f23202ed9ed676))
* add detail page functionality to KMS Keys compliance ([6f9b101](https://github.com/reaandrew/cloud-advice-dashboard/commit/6f9b1013f2aab23085ebc9acdc2e441345e5780f))
* add examples directory with default configuration ([5381848](https://github.com/reaandrew/cloud-advice-dashboard/commit/538184899ad5c5f3a1cf2ae0dd697bdc30d2ddc9))
* add footer with Open Government Licence and proper margins ([#9](https://github.com/reaandrew/cloud-advice-dashboard/issues/9)) ([43bc2c5](https://github.com/reaandrew/cloud-advice-dashboard/commit/43bc2c57240942cc8a01dc8597aefc6c9b3b55c5))
* add GitHub Actions CI workflow with SonarCloud integration ([#5](https://github.com/reaandrew/cloud-advice-dashboard/issues/5)) ([37482fc](https://github.com/reaandrew/cloud-advice-dashboard/commit/37482fc5a77098d33704a4a7c78e487a35cf18b2))
* add semantic-release automation for main branch ([88b3248](https://github.com/reaandrew/cloud-advice-dashboard/commit/88b324810ef8a0e2cd45f4d6d33cdb7c57eeda3c))
* extract the queries ([#2](https://github.com/reaandrew/cloud-advice-dashboard/issues/2)) ([b0683cf](https://github.com/reaandrew/cloud-advice-dashboard/commit/b0683cf33c06f500f406d1108f4fe23f4f5d6eb1))
* fix auth middleware conditional loading and add startup debugging ([b8fe409](https://github.com/reaandrew/cloud-advice-dashboard/commit/b8fe4096fa66ce9bc099b7350035a6826a9d3e10))
* hide compliance menu when viewing policies ([e8dd11b](https://github.com/reaandrew/cloud-advice-dashboard/commit/e8dd11b7868ee4934d80506ee5ca07dc1f9cb38c))
* initial project structure ([9cca1f6](https://github.com/reaandrew/cloud-advice-dashboard/commit/9cca1f6866f4593a8592aa09d9d5fd549da0a8c1))
* Provide a default implementation for getAccountsById ([#7](https://github.com/reaandrew/cloud-advice-dashboard/issues/7)) ([7ad7dd2](https://github.com/reaandrew/cloud-advice-dashboard/commit/7ad7dd2ec87db6719c5a7c33fe4862976dbee019))
* replace Internal Server Error responses with user-friendly no-data pages ([#10](https://github.com/reaandrew/cloud-advice-dashboard/issues/10)) ([e689b05](https://github.com/reaandrew/cloud-advice-dashboard/commit/e689b0539617246780f43834517105d7c17d81bc))
* update dashboard metrics to show 100% for no issues and N/A for no resources ([#8](https://github.com/reaandrew/cloud-advice-dashboard/issues/8)) ([e70b495](https://github.com/reaandrew/cloud-advice-dashboard/commit/e70b4955eed667ee6092d49cf25b6a7c0d1468e5))
* update footer border to match header green ([d12d858](https://github.com/reaandrew/cloud-advice-dashboard/commit/d12d8583c97a2571ea7f45188efbf55bd5899de0)), closes [#008670](https://github.com/reaandrew/cloud-advice-dashboard/issues/008670)
* update header navigation menu ([7e51980](https://github.com/reaandrew/cloud-advice-dashboard/commit/7e5198071958a6069d5f0606dfcaab5f17c0859a))

### Bug Fixes

* add permissions for semantic-release to create tags and releases ([270a1b6](https://github.com/reaandrew/cloud-advice-dashboard/commit/270a1b6e10c2670f51b36537c0dede5d8cb44b0c))
* correct policy breadcrumb capitalization ([953507c](https://github.com/reaandrew/cloud-advice-dashboard/commit/953507cc4affd8e095b63bafa5c2653c5c44b5aa))
* improve KMS details view template structure ([0d4cb29](https://github.com/reaandrew/cloud-advice-dashboard/commit/0d4cb2996fc7ba094a2b0141f9a82085fb4b651c))
* integrate shared.js with config system ([96a84d0](https://github.com/reaandrew/cloud-advice-dashboard/commit/96a84d03c07b990adb7bd4f82a13249e3590ac3f))
* make app title and logo configurable from config ([b46b8c4](https://github.com/reaandrew/cloud-advice-dashboard/commit/b46b8c40d30393f4bbd0c5820bddb8baf8c7e25f))
* remove compliance navigation from policies sidebar ([8498da6](https://github.com/reaandrew/cloud-advice-dashboard/commit/8498da61dd19c48329c9fa20c7229ea65da7ab09))
* specify config file by env vars, modify module export format, fix error logs, fix authorization middleware ([#6](https://github.com/reaandrew/cloud-advice-dashboard/issues/6)) ([9502a93](https://github.com/reaandrew/cloud-advice-dashboard/commit/9502a93093c8f0a96617f4204650509fadf14a90))
* update account mappings structure for actual data keys ([006963b](https://github.com/reaandrew/cloud-advice-dashboard/commit/006963b2ed7faf1d124823fe2e484dad29b92e9d))
* update Node version to 20 and add package-lock.json for semantic-release ([782a81f](https://github.com/reaandrew/cloud-advice-dashboard/commit/782a81fc65760f0193de08fa4f6fa541883716f2))
* use safeLoad ([4f356f0](https://github.com/reaandrew/cloud-advice-dashboard/commit/4f356f00f2114cdfdb8d699d5dce690c320380a3))
