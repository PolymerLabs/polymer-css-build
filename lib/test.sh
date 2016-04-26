#!/usr/bin/env bash
cleanup() {
  pushd lib/polymer >/dev/null
  git checkout .
  (cd ~/polymer/components/polymer; git diff) | patch -Np1
  popd >/dev/null
}
shadow() {
  wct -l chrome test/runner.html
}
shady() {
  wct -l chrome test/shady-runner.html
}

# all normal
cleanup

# shadow build
echo "= shadow build ="
pushd lib/polymer >/dev/null
../../bin/polymer-css-build test/unit/styling-cross-scope-var.html
../../bin/polymer-css-build test/unit/styling-cross-scope-apply.html
../../bin/polymer-css-build test/unit/custom-style.html test/unit/custom-style-import.html test/unit/sub/style-import.html
popd >/dev/null
shadow
cleanup

# shady build
echo "= shady build ="
pushd lib/polymer >/dev/null
../../bin/polymer-css-build --build-for-shady test/unit/styling-cross-scope-var.html
../../bin/polymer-css-build --build-for-shady test/unit/styling-cross-scope-apply.html
../../bin/polymer-css-build --build-for-shady test/unit/custom-style.html test/unit/custom-style-import.html test/unit/sub/style-import.html
popd >/dev/null
shady

# cleanup
