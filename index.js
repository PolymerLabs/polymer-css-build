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

const pred = dom5.predicates;

const domModuleCache = Object.create(null);

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

const notStyleMatch = pred.NOT(styleMatch);

const customStyleMatch = pred.AND(
  pred.hasTagName('style'),
  pred.hasAttrValue('is', 'custom-style')
);

const styleIncludeMatch = pred.AND(styleMatch, pred.hasAttr('include'));

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

const scopeMap = new WeakMap();

function getDomModuleStyles(module) {
  // TODO: support `.styleModules = ['module-id', ...]` ?
  const styles = dom5.queryAll(module, styleMatch);
  if (!styles.length) {
    return [];
  }
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

function getAttributeArray(node, attribute) {
  const attr = dom5.getAttribute(node, attribute);
  let array;
  if (!attr) {
    array = [];
  } else {
    array = attr.split(' ');
  }
  return array;
}

function inlineStyleIncludes(style) {
  if (!styleIncludeMatch(style)) {
    return;
  }
  const styleText = [];
  const includes = getAttributeArray(style, 'include');
  const leftover = [];
  includes.forEach(id => {
    const module = domModuleCache[id];
    if (!module) {
      // we missed this one, put it back on later
      leftover.push(id);
      return;
    }
    const includedStyles = getDomModuleStyles(module);
    // gather included styles
    includedStyles.forEach(ism => {
      // this style may also have includes
      inlineStyleIncludes(ism);
      styleText.push(dom5.getTextContent(ism));
    });
  });
  // remove inlined includes
  if (leftover.length) {
    dom5.setAttribute(style, 'include', leftover.join(' '));
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

let lastShadyInsertionPoint = null;

function findHead(node) {
  while (node.parentNode) {
    node = node.parentNode;
  }
  return dom5.query(node, pred.hasTagName('head'));
}

function afterLastInsertion() {
  if (!lastShadyInsertionPoint) {
    return null;
  }
  const parent = lastShadyInsertionPoint.parentNode;
  const idx = parent.childNodes.indexOf(lastShadyInsertionPoint);
  return parent.childNodes[idx + 1];
}

function moduleIsElement(module, elements) {
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].is === module) {
      return true;
    }
  }
  return false;
}

function shadyShim(ast, style, elements) {
  const scope = scopeMap.get(style);
  // only shim if module is a full polymer element, not just a style module
  if (!scope || !moduleIsElement(scope, elements)) {
    return;
  }
  Polymer.StyleTransformer.css(ast, scope);
  const module = domModuleCache[scope];
  if (!module) {
    return;
  }
  const head = findHead(module);
  dom5.setAttribute(style, 'scope', scope);
  const insertionPoint = afterLastInsertion();
  dom5.insertBefore(head, insertionPoint || head.childNodes[0], style);
  // leave comment breadcrumb for css property shim to insert new styles
  const comment = dom5.constructors.comment();
  dom5.setTextContent(comment, ` Shady DOM styles for ${scope} `)
  dom5.insertBefore(head, style, comment);
  lastShadyInsertionPoint = style;
  const template = dom5.query(module, pred.hasTagName('template'));
  // apply scoping to template
  if (template) {
    const elements = dom5.queryAll(template, notStyleMatch);
    elements.forEach(el => addClass(el, scope));
  }
}

function addClass(node, className) {
  const classList = getAttributeArray(node, 'class');
  classList.push(className, 'style-scope');
  dom5.setAttribute(node, 'class', classList.join(' '));
}

module.exports = (paths, options) => {
  if (options['build-for-shady']) {
    Polymer.Settings.useNativeShadow = false;
  }
  const nativeShadow = Polymer.Settings.useNativeShadow;
  // build hydrolysis loader
  const loader = new hyd.Loader();
  // ignore all files we can't find
  loader.addResolver(new hyd.NoopResolver({test: () => true}));
  // load given files as strings
  paths.forEach(p => {
    loader.addResolver(new hyd.StringResolver(p));
  });
  const analyzer = new hyd.Analyzer(true, loader);
  // run analyzer on all given files
  return Promise.all(
    paths.map(p => analyzer.metadataTree(p.url))
  ).then(() => {
    // un-inline scripts that hydrolysis accendentally inlined
    analyzer.nodeWalkAllDocuments(inlineScriptMatch).forEach(script => {
      if (script.__hydrolysisInlined) {
        dom5.setAttribute(script, 'src', script.__hydrolysisInlined);
        dom5.setTextContent(script, '');
      }
    });
  }).then(() => {
    // map dom modules to styles
    return analyzer.nodeWalkAllDocuments(domModuleMatch).map(el => {
      const id = dom5.getAttribute(el, 'id');
      if (!id) {
        return [];
      }
      // populate cache
      domModuleCache[id] = el;
      const styles = getDomModuleStyles(el);
      styles.forEach(s => scopeMap.set(s, id));
      return styles;
    });
  }).then(moduleStyles => {
    // inline and flatten styles into a single list
    const flatStyles = [];
    moduleStyles.forEach(styles => {
      if (!styles.length) {
        return;
      }
      // do style includes
      styles.forEach(s => inlineStyleIncludes(s));
      // reduce styles to one
      const finalStyle = styles[styles.length - 1];
      if (styles.length > 1) {
        const consumed = styles.slice(-1);
        const text = styles.map(s => dom5.getTextContent(s));
        consumed.forEach(c => dom5.remove(c));
        dom5.setTextContent(finalStyle, text.join(''));
      }
      flatStyles.push(finalStyle);
    });
    return flatStyles;
  }).then(styles =>
    // add in custom styles
    styles.concat(analyzer.nodeWalkAllDocuments(customStyleMatch))
  ).then(styles => {
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
      const isCustomStyle = customStyleMatch(s);
      if (isCustomStyle) {
        // custom-style `:root` selectors need to be processed to `html`
        Polymer.StyleUtil.forEachRule(ast, rule => {
          Polymer.StyleTransformer.documentRule(rule);
        })
      }
      applyShim(ast);
      if (!nativeShadow) {
        shadyShim(ast, s, analyzer.elements);
      }
      text = Polymer.CssParse.stringify(ast, true);
      dom5.setTextContent(s, text);
    });
  }).then(() => {
    return paths.map(p => {
      const docAst = analyzer.parsedDocuments[p.url];
      const script = dom5.constructors.element('script');
      const buildType = options['build-for-shady'] ? 'shady' : 'shadow';
      dom5.setTextContent(script, `PolymerBuild={css:'${buildType}'}`);
      const head = dom5.query(docAst, dom5.predicates.hasTagName('head'));
      dom5.insertBefore(head, head.childNodes[0], script);
      return {
        url: p.url,
        content: dom5.serialize(analyzer.parsedDocuments[p.url])
      }
    });
  });
};
