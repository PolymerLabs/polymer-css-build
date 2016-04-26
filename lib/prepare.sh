#!/usr/bin/env bash
set -e
if [ ! -d polymer ]; then
  git clone git://github.com/Polymer/polymer -b mixins-as-custom-properties
fi
pushd polymer
git pull
popd

if [ ! -d webcomponentsjs ]; then
  git clone git://github.com/webcomponents/webcomponentsjs -b v0.7.22
fi
