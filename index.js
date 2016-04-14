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
const Polymer = require('./lib/polymer-styling.js');
// Polymer.Settings.useNativeShadow = false;
const nativeShadow = Polymer.Settings.useNativeShadow;

const pred = dom5.predicates;

const path = process.argv[2];

const domModuleCache = {};

const domModuleMatch = pred.AND(
  pred.hasTagName('dom-module'),
  pred.hasAttr('id')
);

const styleMatch = pred.AND(
  pred.hasTagName('style'),
  pred.OR(
    pred.NOT(
      pred.hasAttr('type')
    ),
    pred.hasAttrValue('type', 'text/css')
  )
);

const customStyleMatch = pred.AND(
  pred.hasTagName('style'),
  pred.hasAttrValue('is', 'custom-style')
);

const scopeMap = new WeakMap();

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

const styleIncludeMatch = pred.AND(styleMatch, pred.hasAttr('include'));

function inlineStyleIncludes(style, scope) {
  if (!styleIncludeMatch(style)) {
    return;
  }
  const styleText = [];
  const includesAttr = dom5.getAttribute(style, 'include');
  let includes;
  if (!includesAttr) {
    includes = [];
  } else {
    includes = includesAttr.split(' ');
  }
  includes.forEach((id,idx) => {
    const module = domModuleCache[id];
    if (!module) {
      return;
    }
    // remove this include from the list
    includes.splice(idx, 1);
    const includedStyles = getDomModuleStyles(module, scope)
    // gather included styles
    includedStyles.forEach(ism => {
      styleText.push(dom5.getTextContent(ism));
    });
  });
  // remove inlined includes
  if (includes.length) {
    dom5.setAttribute(style, 'include', includes.join(' '));
  } else {
    dom5.removeAttribute(style, 'include');
  }
  // prepend included styles
  if (styleText.length) {
    let text = dom5.getTextContent(style);
    text = styleText.join('') + text;
    dom5.setTextContent(style, text);
  }
}

function applyShim(ast) {
  /*
   * `transform` expects an array of decorated <style> elements
   *
   * Decorated <style> elements are ones with `__cssRules` property
   * with a value of the CSS ast
   */
  Polymer.ApplyShim.transform([{__cssRules: ast}]);
}

const inlineScriptMatch = pred.AND(
  pred.hasTagName('script'),
  pred.OR(
    pred.NOT(
      pred.hasAttr('type')
    ),
    pred.hasAttrValue('type', 'text/javascript'),
    pred.hasAttrValue('type', 'application/javascript')
  ),
  pred.NOT(
    pred.hasAttr('src')
  )
);

function addClass(node, className) {
  const classAttr = dom5.getAttribute(node, 'class');
  let classList;
  if (!classAttr) {
    classList = [];
  } else {
    classList = classAttr.split(' ');
  }
  classList.push(className, 'style-scope');
  dom5.setAttribute(node, 'class', classList.join(' '));
}

let analyzer;

hyd.Analyzer.analyze(path, {attachAST: true}).then(a => {
  analyzer = a;
  return analyzer.html[path].depsLoaded;
}).then(() => {
  analyzer.nodeWalkAllDocuments(inlineScriptMatch).forEach(script => {
    if (script.__hydrolysisInlined) {
      dom5.setAttribute(script, 'src', script.__hydrolysisInlined);
      dom5.setTextContent(script, '');
    }
  });
}).then(() => {
  return analyzer.nodeWalkAllDocuments(domModuleMatch).map(el => {
    const id = dom5.getAttribute(el, 'id');
    if (!id) {
      return [];
    }
    // populate cache
    domModuleCache[id] = el;
    return getDomModuleStyles(el, id);
  }).reduce((a, b) => a.concat(b));
}).then(styles => {
  return styles.concat(analyzer.nodeWalkAllDocuments(customStyleMatch))
}).then(styles => {
  styles.forEach(s => {
    const scope = scopeMap.get(s);
    inlineStyleIncludes(s, scope);
  });
  return styles;
}).then(styles => {
  // reverse list to catch mixin use before definition
  styles.reverse();
  // populate mixin map
  styles.forEach(s => {
    const text = dom5.getTextContent(s);
    const ast = Polymer.CssParse.parse(text);
    applyShim(ast);
  });
  // parse, transform, emit
  styles.forEach(s => {
    let text = dom5.getTextContent(s);
    const ast = Polymer.CssParse.parse(text);
    if (customStyleMatch(s)) {
      // custom-style `:root` selectors need to be processed to `html`
      Polymer.StyleUtil.forEachRule(ast, rule => {
        Polymer.StyleTransformer.documentRule(rule);
      })
    }
    applyShim(ast);
    const scope = scopeMap.get(s);
    if (!nativeShadow && scope) {
      Polymer.StyleTransformer.css(ast, scope);
      const module = domModuleCache[scope];
      if (module) {
        const template = dom5.query(module, pred.hasTagName('template'));
        if (template) {
          const elements = dom5.queryAll(template, () => true);
          elements.forEach(el => {
            addClass(el, scope);
          })
        }
      }
    }
    text = Polymer.CssParse.stringify(ast, true);
    dom5.setTextContent(s, text);
  });
}).then(() => {
  console.log(dom5.serialize(analyzer.parsedDocuments[path]));
}).catch(err => {
  console.error(err.stack)
  process.exit(1);
});
