# Container distribution guidance

Spernakit builds container images only as local verification artifacts. The template project
does not publish, supply, or offer those images to downstream users. This document is guidance,
not a corresponding-source offer by NomadicDaddy.

A derived project that gives a built image to another party becomes the distributor of the
third-party components in that image. Before doing so, its owner should review the exact image
and satisfy the licenses that apply to it. At minimum:

- preserve the license and attribution files already included in the image;
- inventory the exact Bun, Alpine, and application-package versions in the distributed digest;
- provide complete corresponding source for GPL and LGPL components using a method permitted by
  the applicable license;
- provide the source, object files, build scripts, and other machine-readable materials needed
  to rebuild or relink Bun with modified LGPL components; and
- keep immutable image-digest-to-source records for as long as the image remains available.

For a network-distributed image, generic links to current upstream branches are not an adequate
substitute for source matching the distributed binary. The GNU license FAQ explains source
delivery options at <https://www.gnu.org/licenses/gpl-faq.html>. Bun records its linked libraries
and relink procedure at <https://github.com/oven-sh/bun/blob/main/LICENSE.md>.

Derived-project owners should obtain legal advice for their own distribution model. Spernakit's
local build and image checks prove buildability and inventory coverage; they do not grant a
derived project permission to publish an image or fulfill that project's source obligations.
