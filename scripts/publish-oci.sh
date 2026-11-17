#!/usr/bin/env bash
set -euo pipefail
image="$1"
tag="$2"
[[ "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
version="${tag#v}"
cd dist
# Existing tags are immutable: a rerun succeeds only if every artifact matches.
if oras manifest fetch "$image:$tag" > existing-manifest.json 2> lookup-error.txt; then
  mkdir existing
  oras pull "$image:$tag" --output existing
  for file in "sip-$version.tar.gz" "sip-npm-$version.tgz" "sip-plugin-$version.zip" SHA256SUMS; do
    cmp "$file" "existing/$file"
  done
else
  # Do not interpret authentication or network failures as an absent version.
  if ! grep -Eq 'MANIFEST_UNKNOWN|manifest unknown|not found' lookup-error.txt; then
    cat lookup-error.txt >&2
    exit 1
  fi
  oras push "$image:$tag" \
    --artifact-type application/vnd.containersecurity.sip.bundle.v1 \
    --annotation "org.opencontainers.image.source=https://github.com/$GITHUB_REPOSITORY" \
    --annotation "org.opencontainers.image.version=$version" \
    "sip-$version.tar.gz:application/gzip" \
    "sip-npm-$version.tgz:application/gzip" \
    "sip-plugin-$version.zip:application/zip" SHA256SUMS:text/plain
fi
digest="$(oras resolve "$image:$tag")"
echo "Published/verified OCI bundle: $image@$digest" >> "$GITHUB_STEP_SUMMARY"
