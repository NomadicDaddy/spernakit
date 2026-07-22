# Third-Party Licenses

Spernakit is licensed under the [MIT License](./LICENSE). This document records the license
inventory of the npm dependencies declared by this repository, and carries notice,
source-location, and relink information for the Bun runtime in the local verification image (see "Bundled runtime:
Bun and its LGPL components" below). Package-specific npm terms are reproduced in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). Runtime license texts, the Alpine package
inventory, and downstream distribution guidance live in [`licenses/`](./licenses). These files
are copied into the local verification image and remain available to derived projects.

Read the scope limits below before treating this as a complete notice for the image: it
enumerates the _direct_ production npm dependencies and summarizes the rest of the npm graph
by license family, and it does not inventory the Alpine base system.

## Backend runtime dependencies

| Package                                                              | Version | License       |
| -------------------------------------------------------------------- | ------- | ------------- |
| [@elysiajs/swagger](https://www.npmjs.com/package/@elysiajs/swagger) | 1.3.1   | MIT           |
| [@sinclair/typebox](https://www.npmjs.com/package/@sinclair/typebox) | 0.34.52 | MIT           |
| [@types/pg](https://www.npmjs.com/package/@types/pg)                 | 8.20.0  | MIT           |
| [drizzle-orm](https://www.npmjs.com/package/drizzle-orm)             | 0.45.2  | Apache-2.0    |
| [elysia](https://www.npmjs.com/package/elysia)                       | 1.4.29  | MIT           |
| [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken)           | 9.0.3   | MIT           |
| [lru-cache](https://www.npmjs.com/package/lru-cache)                 | 11.5.2  | BlueOak-1.0.0 |
| [nodemailer](https://www.npmjs.com/package/nodemailer)               | 9.0.3   | MIT-0         |
| [otpauth](https://www.npmjs.com/package/otpauth)                     | 9.5.1   | MIT           |
| [pg](https://www.npmjs.com/package/pg)                               | 8.22.0  | MIT           |
| [pino](https://www.npmjs.com/package/pino)                           | 10.3.1  | MIT           |
| [pino-roll](https://www.npmjs.com/package/pino-roll)                 | 4.0.0   | MIT           |

## Frontend runtime dependencies

| Package                                                                                      | Version | License    |
| -------------------------------------------------------------------------------------------- | ------- | ---------- |
| [@fontsource-variable/inter](https://www.npmjs.com/package/@fontsource-variable/inter)       | 5.3.0   | OFL-1.1    |
| [@fontsource-variable/manrope](https://www.npmjs.com/package/@fontsource-variable/manrope)   | 5.3.0   | OFL-1.1    |
| [@radix-ui/react-alert-dialog](https://www.npmjs.com/package/@radix-ui/react-alert-dialog)   | 1.1.20  | MIT        |
| [@radix-ui/react-avatar](https://www.npmjs.com/package/@radix-ui/react-avatar)               | 1.2.3   | MIT        |
| [@radix-ui/react-checkbox](https://www.npmjs.com/package/@radix-ui/react-checkbox)           | 1.3.8   | MIT        |
| [@radix-ui/react-dialog](https://www.npmjs.com/package/@radix-ui/react-dialog)               | 1.1.20  | MIT        |
| [@radix-ui/react-dropdown-menu](https://www.npmjs.com/package/@radix-ui/react-dropdown-menu) | 2.1.21  | MIT        |
| [@radix-ui/react-label](https://www.npmjs.com/package/@radix-ui/react-label)                 | 2.1.12  | MIT        |
| [@radix-ui/react-popover](https://www.npmjs.com/package/@radix-ui/react-popover)             | 1.1.20  | MIT        |
| [@radix-ui/react-progress](https://www.npmjs.com/package/@radix-ui/react-progress)           | 1.1.13  | MIT        |
| [@radix-ui/react-select](https://www.npmjs.com/package/@radix-ui/react-select)               | 2.3.4   | MIT        |
| [@radix-ui/react-separator](https://www.npmjs.com/package/@radix-ui/react-separator)         | 1.1.12  | MIT        |
| [@radix-ui/react-slot](https://www.npmjs.com/package/@radix-ui/react-slot)                   | 1.3.0   | MIT        |
| [@radix-ui/react-switch](https://www.npmjs.com/package/@radix-ui/react-switch)               | 1.3.4   | MIT        |
| [@radix-ui/react-tabs](https://www.npmjs.com/package/@radix-ui/react-tabs)                   | 1.1.18  | MIT        |
| [@radix-ui/react-tooltip](https://www.npmjs.com/package/@radix-ui/react-tooltip)             | 1.2.13  | MIT        |
| [@tanstack/react-query](https://www.npmjs.com/package/@tanstack/react-query)                 | 5.101.4 | MIT        |
| [@tanstack/react-table](https://www.npmjs.com/package/@tanstack/react-table)                 | 8.21.3  | MIT        |
| [@tanstack/react-virtual](https://www.npmjs.com/package/@tanstack/react-virtual)             | 3.14.7  | MIT        |
| [class-variance-authority](https://www.npmjs.com/package/class-variance-authority)           | 0.7.1   | Apache-2.0 |
| [clsx](https://www.npmjs.com/package/clsx)                                                   | 2.1.1   | MIT        |
| [cmdk](https://www.npmjs.com/package/cmdk)                                                   | 1.1.1   | MIT        |
| [lucide-react](https://www.npmjs.com/package/lucide-react)                                   | 1.25.0  | ISC        |
| [qrcode](https://www.npmjs.com/package/qrcode)                                               | 1.5.4   | MIT        |
| [react](https://www.npmjs.com/package/react)                                                 | 19.2.8  | MIT        |
| [react-dom](https://www.npmjs.com/package/react-dom)                                         | 19.2.8  | MIT        |
| [react-grid-layout](https://www.npmjs.com/package/react-grid-layout)                         | 2.2.3   | MIT        |
| [react-router-dom](https://www.npmjs.com/package/react-router-dom)                           | 7.18.1  | MIT        |
| [recharts](https://www.npmjs.com/package/recharts)                                           | 3.10.0  | MIT        |
| [sonner](https://www.npmjs.com/package/sonner)                                               | 2.0.7   | MIT        |
| [tailwind-merge](https://www.npmjs.com/package/tailwind-merge)                               | 3.6.0   | MIT        |
| [web-vitals](https://www.npmjs.com/package/web-vitals)                                       | 6.0.0   | Apache-2.0 |
| [zustand](https://www.npmjs.com/package/zustand)                                             | 5.0.14  | MIT        |

## Required notices by license family

### Apache License 2.0

Applies to: class-variance-authority, drizzle-orm, web-vitals.

These packages are licensed under the Apache License, Version 2.0. A copy of
the license is available at <https://www.apache.org/licenses/LICENSE-2.0>.
The software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. Where a package ships a
`NOTICE` file, that file travels with the package in `node_modules` and its
attributions apply.

### Blue Oak Model License 1.0.0

Applies to: lru-cache.

These packages are licensed under the Blue Oak Model License 1.0.0, available
at <https://blueoakcouncil.org/license/1.0.0>. It is a permissive license: it
grants copyright and patent permission to use, modify, and redistribute the
software, on the conditions that the license text travels with copies of the
software and that the contributors are not held liable. The software is
provided "as is" without any warranty.

### ISC License

Applies to: lucide-react.

> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
> REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
> FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
> INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
> LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
> OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.

### MIT License

Applies to: @elysiajs/swagger, @radix-ui/react-alert-dialog, @radix-ui/react-avatar, @radix-ui/react-checkbox, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-label, @radix-ui/react-popover, @radix-ui/react-progress, @radix-ui/react-select, @radix-ui/react-separator, @radix-ui/react-slot, @radix-ui/react-switch, @radix-ui/react-tabs, @radix-ui/react-tooltip, @sinclair/typebox, @tanstack/react-query, @tanstack/react-table, @tanstack/react-virtual, @types/pg, clsx, cmdk, elysia, jsonwebtoken, otpauth, pg, pino, pino-roll, qrcode, react, react-dom, react-grid-layout, react-router-dom, recharts, sonner, tailwind-merge, zustand.

Each MIT-licensed dependency is provided under the standard MIT License, with
copyright held by the respective package authors as stated in that package.
The permission notice and warranty disclaimer below apply to each of them.

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

### MIT No Attribution

Applies to: nodemailer.

The MIT No Attribution license grants the same permissions as MIT without the
requirement to reproduce the copyright notice. The text is available at
<https://github.com/aws/mit-0>. The software is provided "as is", without
warranty of any kind.

### SIL Open Font License 1.1

Applies to: @fontsource-variable/inter, @fontsource-variable/manrope.

The bundled font files are licensed under the SIL Open Font License, Version
1.1, available at <https://openfontlicense.org>. The fonts may be used,
studied, modified, and redistributed freely so long as they are not sold by
themselves and any derivative reserved names are not used without permission.
The license and copyright notice must be retained with the font files, which
are included in the distributed asset tree.

## Conservative production closure

The tables above enumerate the direct production dependencies. The lockfile-resolved
closure follows everything they pull in transitively and covers **224**
third-party package versions (221 unique names). It includes backend runtime
packages, frontend bundle inputs, and any optional packages the lockfile resolves for them,
regardless of the platform generating this file. It can therefore be larger than the
package-directory count in the Linux image, but it must never be smaller. Development-only
tooling is excluded. Its license distribution is:

| License          | Packages |
| ---------------- | -------- |
| MIT              | 189      |
| ISC              | 22       |
| Apache-2.0       | 4        |
| BSD-3-Clause     | 2        |
| OFL-1.1          | 2        |
| (MIT OR CC0-1.0) | 1        |
| 0BSD             | 1        |
| BlueOak-1.0.0    | 1        |
| MIT AND ISC      | 1        |
| MIT-0            | 1        |

No copyleft or weak-copyleft licensed package (GPL, AGPL, SSPL, EUPL, CDDL,
OSL, MPL) appears in this production closure. Build tooling is a separate question:
it is not distributed, so it is not inventoried here.

## Bundled runtime: Bun and its LGPL components

The local verification image is built on `oven/bun:1.3.14-alpine`, so it contains the Bun
runtime, and Bun statically links libraries under the LGPL. This section records what a derived
project must consider before distributing that image. Bun's own license text is reproduced in
[`licenses/BUN-LICENSE.md`](./licenses/BUN-LICENSE.md); that file, this file, and the root
`LICENSE` are copied into every local build.

Spernakit does not publish or offer its verification images. A derived project that distributes
one must provide its own corresponding-source and relink-materials fulfillment. The checklist in
[`licenses/CONTAINER-DISTRIBUTION.md`](./licenses/CONTAINER-DISTRIBUTION.md) is guidance, not an
offer by NomadicDaddy.

**LGPL components linked into the Bun runtime**

| Component                                         | License  | Full text                                          |
| ------------------------------------------------- | -------- | -------------------------------------------------- |
| JavaScriptCore / WebKit (including WebCore files) | LGPL-2   | [`licenses/LGPL-2.0.txt`](./licenses/LGPL-2.0.txt) |
| TinyCC                                            | LGPL-2.1 | [`licenses/LGPL-2.1.txt`](./licenses/LGPL-2.1.txt) |

Bun statically links many other libraries under permissive terms (BoringSSL, brotli,
libarchive, mimalloc, zstd, simdutf, c-ares, libicu, zlib-ng and others), listed with their
licenses in `licenses/BUN-LICENSE.md`.

**Upstream source locations**

- The patched WebKit/JavaScriptCore that Bun links is published at
  <https://github.com/oven-sh/webkit>.
- Bun itself (MIT) is at <https://github.com/oven-sh/bun>, tagged `bun-v1.3.14`.
- TinyCC is at <https://github.com/tinycc/tinycc>.

**How to modify the LGPL library and relink**

Bun is not statically linked into the application here: it is the interpreter the image runs,
supplied by the base image and dynamically replaceable. A downstream recipient who wants a modified
JavaScriptCore can build a modified Bun (`git submodule update --init --recursive`,
`make jsc`, `zig build`, per Bun's LICENSE.md), install it over the runtime in the image, or
rebuild the image with a base image containing it. Spernakit's own source is MIT, so nothing
here restricts that. A downstream distributor must preserve exact corresponding source rather
than rely on these upstream locations remaining unchanged.

## Scope and what is verified

Scope limits of the tables above, recorded rather than left implicit:

- **Transitive npm packages are not enumerated.** The tables list direct production
  dependencies only; the rest of the npm graph appears as license-family counts. The image
  copies the whole installed tree, so transitive packages are included too, and their
  individual attribution notices are not reproduced here.
- **Build and development tooling is not inventoried.** It is not included: the image
  installs production dependencies only.
- **The closure is resolved from the lockfile.** It conservatively covers backend runtime
  packages and frontend bundle inputs; optional packages the lockfile records can make its
  count larger than the exact Linux image package-directory count.
- **MPL-2.0 `lightningcss` is build-time only and is not in the image.** The image installs
  production dependencies only. If `lightningcss` enters the image, MPL-2.0 requires recipients
  of executable-form distribution to be told where the source is:
  <https://github.com/parcel-bundler/lightningcss>.

What the local verification image actually contains is checked against the built image, not inferred:

- Per-package copyright lines, license text and `NOTICE` files for the whole runtime closure
  are reproduced in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
- `bun run check:image-licenses` opens the built image and fails if any npm package inside it
  is missing from that appendix, or if the notices are not present in the image.
- The operating-system packages are inventoried in
  [`licenses/base-image-packages.md`](./licenses/base-image-packages.md), read from the image's
  own apk database.

Both files are present inside the image, alongside `LICENSE` and this document.

The base image contains GPL-licensed programs (busybox, apk-tools, gettext and others). They
are unmodified operating-system components alongside the application, not libraries
linked into it. Their exact package versions are recorded in the base-image inventory. GPL and
LGPL license texts plus downstream guidance are included in `licenses/`; Alpine's upstream
source is published at <https://gitlab.alpinelinux.org/alpine/aports>.

## Regenerating this file

This document is generated from the locked dependency graph. Run
`bun run licenses:generate` after changing dependencies, and commit the result.
`bun run check:licenses` (part of `smoke:qc` and CI) regenerates it in memory and
fails when the committed copy no longer matches what the lockfile resolves.
