#!/usr/bin/env bash
set -x
set -e
if [ ! -d .polymer ]; then
  git clone git://github.com/Polymer/polymer -b mixins-as-custom-properties .polymer
fi
pushd .polymer
git pull
popd
vulcanize styling-import.html --strip-exclude .polymer/src/lib/settings.html | crisper -h /dev/null -j polymer-styling.js
