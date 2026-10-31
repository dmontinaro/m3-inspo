# Third-party notices

m3 inspo's original additions are distributed under [MIT](LICENSE). The following material retains its own copyright and license. Renaming packages does not change these obligations.

## Inspo

Parts of `packages/db`, `packages/mcp`, `packages/shared`, `packages/taxonomy` and `apps/worker/src` were adapted from [Nutlope/inspo](https://github.com/Nutlope/inspo) at commit `85acb10f42e433b696fd95a447baf4d47d11021d`. The analysis prompt in `apps/web/src/server/analysis-model.server.ts` was also adapted from its worker tagging code.

Copyright (c) 2026 Together AI and contributors. The complete MIT notice is retained in [LICENSE-INSPO](LICENSE-INSPO). Include it when distributing these parts, including in source archives and container images.

## Tailwind CSS palette

`packages/shared/src/color-scheme/tailwind-palette.ts` contains palette values from Tailwind CSS 4.3.3. Its complete MIT notice, Copyright (c) Tailwind Labs, Inc., is retained in that file.

## Fonts and icons

The application uses Mona Sans through `@fontsource-variable/mona-sans`, under SIL Open Font License 1.1. The reserved font names and full license are retained in [LICENSE-MONA-SANS](LICENSE-MONA-SANS).

Lucide icons retain their ISC license. See the license distributed with `lucide-react`. Other installed dependencies retain the licenses shipped with their packages; this document does not replace those notices. Inspect the resolved dependency inventory with `pnpm licenses list --prod` before distributing a release.

Adobe Fonts is an optional external service. Its fonts are not included in this repository or relicensed by this project. Operators need their own account, permissions and domain configuration.

## Native and data dependencies

The resolved Linux dependency tree includes `@img/sharp-libvips-linux-x64` under LGPL-3.0-or-later. It contains libvips and other native libraries. Preserve the package's included license notices and satisfy the applicable source and relinking requirements when distributing binaries or containers. Its upstream build sources are at https://github.com/lovell/sharp-libvips; inspect the exact package and platform shipped for a release.

`lightningcss` and its native package use MPL-2.0. `caniuse-lite` data uses CC-BY-4.0. These are tooling dependencies in the resolved tree. Keep their package notices if distributing the toolchain; their presence does not change the license of m3 inspo's original source files.

## Collected content

Website screenshots, uploaded images, saved notes, brand assets and preview images belong to their respective rights holders. The software license grants no additional rights to that content. Distribute demonstration data only when you have permission to do so.
