#!/usr/bin/env bash
vulcanize styling-import.html --strip-exclude polymer/src/lib/settings.html | crisper -h /dev/null -j polymer-styling.js
