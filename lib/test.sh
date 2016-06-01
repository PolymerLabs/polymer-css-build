#!/usr/bin/env bash
set -e
cleanup() {
  pushd lib/polymer >/dev/null
  git checkout .
  popd >/dev/null
}

prep_shadow() {
  pushd lib/polymer >/dev/null
  ../../bin/polymer-css-build test/unit/styling-scoped-elements.html test/unit/styling-scoped.html
  ../../bin/polymer-css-build test/unit/styling-cross-scope-unknown-host.html
  ../../bin/polymer-css-build test/unit/styling-cross-scope-var.html
  ../../bin/polymer-css-build test/unit/styling-cross-scope-apply.html
  ../../bin/polymer-css-build test/unit/custom-style.html test/unit/custom-style-import.html test/unit/sub/style-import.html
  ../../bin/polymer-css-build test/unit/custom-style-late.html test/unit/custom-style-late-import.html
  popd >/dev/null
}

test_shadow() {
  wct -l chrome -l firefox test/runner.html
}

prep_shady() {
  pushd lib/polymer >/dev/null
  ../../bin/polymer-css-build --build-for-shady test/unit/styling-scoped-elements.html test/unit/styling-scoped.html
  ../../bin/polymer-css-build --build-for-shady test/unit/styling-cross-scope-var.html
  ../../bin/polymer-css-build --build-for-shady test/unit/styling-cross-scope-apply.html
  ../../bin/polymer-css-build --build-for-shady test/unit/custom-style.html test/unit/custom-style-import.html test/unit/sub/style-import.html
  ../../bin/polymer-css-build --build-for-shady test/unit/custom-style-late.html test/unit/custom-style-late-import.html
  popd >/dev/null
}

test_shady() {
  wct -l chrome -l firefox test/shady-runner.html
}

# all normal
cleanup

# shadow build
echo "= shadow build ="
prep_shadow
test_shadow

# revert
cleanup

# shady build
echo "= shady build ="
prep_shady
test_shady
