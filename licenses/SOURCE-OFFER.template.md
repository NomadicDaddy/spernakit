# Corresponding source and relink materials offer

<!--
  TEMPLATE. Spernakit itself distributes no container images, so it makes no offer and this file
  stays a template here. `bun run setup` copies it to licenses/SOURCE-OFFER.md in a derived
  project.

  If your project publishes a container image, you become the distributor of the GPL/LGPL
  components inside it, and this offer is what a recipient relies on. Replace every <PLACEHOLDER>
  with a real value: `check:image-publication` and `docker:image:push` both refuse to let an
  image ship while any placeholder remains, because an offer a recipient cannot act on is not an
  offer.

  If you never publish an image, delete this file and the publication scripts instead. Nothing
  obliges you to make an offer for software you do not distribute.
-->

<PROJECT NAME> container images redistribute the Bun runtime and Alpine Linux packages. Some of
those components are licensed under GPL or LGPL terms that require corresponding source and, for
Bun's statically linked LGPL components, the materials that let a recipient rebuild or relink
the executable.

For every <PROJECT NAME> container image that includes this file, <LEGAL ENTITY> offers to
provide any recipient, and anyone who possesses a copy of the corresponding image, the following
materials:

- the complete corresponding source and build scripts for every GPL- or LGPL-licensed Alpine
  package identified in the accompanying `base-image-packages.md`;
- the complete source tree for the exact Bun version identified in the image, including its
  pinned submodules and the patched WebKit/JavaScriptCore and TinyCC sources; and
- the source, build scripts, and other machine-readable materials needed to rebuild Bun with a
  modified LGPL component and install the resulting runtime in the image.

The materials are available by electronic transfer at no charge. Physical transfer, if
requested, will cost no more than the reasonable cost of performing that transfer. This offer
remains valid for at least three years after the last distribution of the corresponding image.

To request the materials, contact <CONTACT ADDRESS>. Identify the image by its immutable digest;
a version tag alone may be insufficient if the tag has moved.

For convenience, the principal upstream source locations are:

- Bun: <https://github.com/oven-sh/bun>, at the `bun-v<version>` tag recorded by the image;
- Bun's patched WebKit: <https://github.com/oven-sh/webkit>, pinned by that Bun source tree;
- TinyCC: <https://github.com/TinyCC/tinycc>; and
- Alpine package sources: <https://gitlab.alpinelinux.org/alpine/aports>.

These links do not replace the offer above. Generic links to current upstream branches are not
an adequate substitute for source matching the distributed binary, so keep immutable
digest-to-source records for as long as each image remains available.
