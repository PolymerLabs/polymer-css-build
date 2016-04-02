/**
@license
Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

'use strict';
const hyd = require('hydrolysis');
const dom5 = require('dom5');
const pred = dom5.predicates;
const Polymer = require('./lib/polymer-styling.js');

const path = process.argv[2];

function getDomModules(analyzer, id) {
  if (!analyzer.__domModuleCache) {
    analyzer.__domModuleCache = {};
  }
  if (analyzer.__domModuleCache[id]) {
    return analyzer.__domModuleCache[id];
  }
  analyzer.__domModuleCache[id] =
      analyzer.nodeWalkAllDocuments(domModuleForId(id));
  return analyzer.__domModuleCache[id];
}

const styleMatch = pred.AND(
  pred.hasTagName('style'),
  pred.OR(
    pred.NOT(
      pred.hasAttr('type')
    ),
    pred.hasAttrValue('type', 'text/css')
  )
);

const isCustomStyle = pred.AND(
  pred.hasTagName('style'),
  pred.hasAttrValue('is', 'custom-style')
);

const scopeMap = new WeakMap();

function domModuleForId(id) {
  return pred.AND(
    pred.hasTagName('dom-module'),
    pred.hasAttrValue('id', id)
  );
}

function getDomModuleStyles(module, scope) {
  const styles = dom5.queryAll(module, styleMatch);
  if (!styles.length) {
    return [];
  }
  styles.forEach(s => scopeMap.set(s, scope));
  let template = dom5.query(module, pred.hasTagName('template'));
  if (!template) {
    template = dom5.constructors.element('template');
    const content = dom5.constructors.fragment();
    styles.forEach(s => dom5.append(content, s));
    dom5.append(template, content);
    dom5.append(module, template);
  } else {
    styles.forEach(s => {
      let templateContent = template.childNodes[0];
      if (!templateContent) {
        templateContent = dom5.constructors.fragment();
        dom5.append(template, templateContent);
      }
      const parent = dom5.nodeWalkPrior(s, n =>
        n === templateContent || n === module
      );
      if (parent !== templateContent) {
        dom5.append(templateContent, s);
      }
    })
  }
  return styles;
}

let analyzer;

hyd.Analyzer.analyze(path, {attachAST: true}).then(a => {
  analyzer = a;
  return analyzer.html[path].depsLoaded;
}).then(() => {
  return analyzer.elements.map(el => {
    if (el.is === 'Polymer.Base') {
      return [];
    }
    const domModules = getDomModules(analyzer, el.is);
    if (domModules.length === 0) {
      return [];
    }
    return getDomModuleStyles(domModules[0], el.is);
  }).reduce((a, b) => a.concat(b));
}).then(styles => {
  return styles.concat(analyzer.nodeWalkAllDocuments(isCustomStyle))
}).then(styles => {
  // populate mixin map
  styles.forEach(s => {
    const text = dom5.getTextContent(s);
    Polymer.ApplyShim.transformCssText(text);
  });
  // parse, transform, emit
  styles.forEach(s => {
    let text = dom5.getTextContent(s);
    const ast = Polymer.CssParse.parse(text);
    // fake <style> with parsed css rules
    const fakeStyles = [{__cssRules: ast}];
    if (isCustomStyle(s)) {
      // custom-style `:root` selectors need to be processed to `html`
      Polymer.StyleUtil.forEachRule(ast, rule => {
        Polymer.StyleTransformer.documentRule(rule);
      })
    }
    Polymer.ApplyShim.transform(fakeStyles);
    const scope = scopeMap.get(s);
    if (scope) {
      // Polymer.StyleTransformer.css(ast, scope);
    }
    text = Polymer.CssParse.stringify(ast, true);
    dom5.setTextContent(s, text);
  });
}).then(() => {
  console.log(dom5.serialize(analyzer.parsedDocuments[path]));
}).catch(err => {
  console.log(err.stack)
  process.exit(1);
});
