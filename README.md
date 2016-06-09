# Polymer CSS Builder
> Statically apply Polymer's CSS Mixin shim and CSS Custom Property shim (future work)

## Use
1. Vulcanize your project
2. Checkout this tool
3. `npm install`
4. `node bin/polymer-css-build path/to/vulcanized-file.html`
5. If multiple files are passed, they are expected to be [shards](https://github.com/polymerlabs/web-component-shards) of the same project

## Build Types, Targeted Builds, and Polymer DOM modes

> TL;DR: Set `--build-for-shady` if you don't use `Polymer = {dom: 'shadow'}` in your app.

Polymer by default uses ShadyDOM, a lightweight shim of the ShadowDOM spec.
Real ShadowDOM can be used by setting `Polymer = {dom: 'shadow'}` before the HTMLImport for Polymer.

We define "targeted builds" to mean that when using the matching `polymer-css-build` type and Polymer `dom` setting, no additional runtime style work will be performed.

By default, `polymer-css-build` will produce built styles that are targeted for ShadowDOM.
This is done because ShadowDOM styles can still be used in ShadyDOM mode with some runtime work, and the built styles are portable to both Polymer ShadyDOM and ShadowDOM scoping modes

However, if your app only uses ShadyDOM (the default of Polymer 1.x), then some runtime work is still done to convert CSS selectors.

To produce a targeted build for ShadyDOM, pass the `--build-for-shady` flag on the command line, or `{'build-for-shady': true}` to the library.
However, these styles will _only_ work with the ShadyDOM `dom` setting; the modifications for ShadyDOM remove some CSS selector information necessary for ShadowDOM.
