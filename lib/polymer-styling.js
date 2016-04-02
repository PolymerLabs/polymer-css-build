/**
@license
Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/
var Polymer = {
  Settings: {
    useNativeShadow: true,
    useNativeCSSProperties: true
  },
  ResolveUrl: {
    resolveCss: function(css) {
      return css;
    }
  }
};
module.exports = Polymer;
/*
  Extremely simple css parser. Intended to be not more than what we need
  and definitely not necessarily correct =).
*/
Polymer.CssParse = (function() {

  return {
    // given a string of css, return a simple rule tree
    parse: function(text) {
      text = this._clean(text);
      return this._parseCss(this._lex(text), text);
    },

    // remove stuff we don't care about that may hinder parsing
    _clean: function (cssText) {
      return cssText.replace(this._rx.comments, '').replace(this._rx.port, '');
    },

    // super simple {...} lexer that returns a node tree
    _lex: function(text) {
      var root = {start: 0, end: text.length};
      var n = root;
      for (var i=0, l=text.length; i < l; i++) {
        switch (text[i]) {
          case this.OPEN_BRACE:
            //console.group(i);
            if (!n.rules) {
              n.rules = [];
            }
            var p = n;
            var previous = p.rules[p.rules.length-1];
            n = {start: i+1, parent: p, previous: previous};
            p.rules.push(n);
            break;
          case this.CLOSE_BRACE:
            //console.groupEnd(n.start);
            n.end = i+1;
            n = n.parent || root;
            break;
        }
      }
      return root;
    },

    // add selectors/cssText to node tree
    _parseCss: function(node, text) {
      var t = text.substring(node.start, node.end-1);
      node.parsedCssText = node.cssText = t.trim();
      if (node.parent) {
        var ss = node.previous ? node.previous.end : node.parent.start;
        t = text.substring(ss, node.start-1);
        t = this._expandUnicodeEscapes(t);
        t = t.replace(this._rx.multipleSpaces, ' ');
        // TODO(sorvell): ad hoc; make selector include only after last ;
        // helps with mixin syntax
        t = t.substring(t.lastIndexOf(';')+1);
        var s = node.parsedSelector = node.selector = t.trim();
        node.atRule = (s.indexOf(this.AT_START) === 0);
        // note, support a subset of rule types...
        if (node.atRule) {
          if (s.indexOf(this.MEDIA_START) === 0) {
            node.type = this.types.MEDIA_RULE;
          } else if (s.match(this._rx.keyframesRule)) {
            node.type = this.types.KEYFRAMES_RULE;
            node.keyframesName =
                node.selector.split(this._rx.multipleSpaces).pop();
          }
        } else {
          if (s.indexOf(this.VAR_START) === 0) {
            node.type = this.types.MIXIN_RULE;
          } else {
            node.type = this.types.STYLE_RULE;
          }
        }
      }
      var r$ = node.rules;
      if (r$) {
        for (var i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
          this._parseCss(r, text);
        }
      }
      return node;
    },

    // conversion of sort unicode escapes with spaces like `\33 ` (and longer) into
    // expanded form that doesn't require trailing space `\000033`
    _expandUnicodeEscapes : function(s) {
      return s.replace(/\\([0-9a-f]{1,6})\s/gi, function() {
        var code = arguments[1], repeat = 6 - code.length;
        while (repeat--) {
          code = '0' + code;
        }
        return '\\' + code;
      });
    },

    // stringify parsed css.
    stringify: function(node, preserveProperties, text) {
      text = text || '';
      // calc rule cssText
      var cssText = '';
      if (node.cssText || node.rules) {
        var r$ = node.rules;
        if (r$ && !this._hasMixinRules(r$)) {
          for (var i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
            cssText = this.stringify(r, preserveProperties, cssText);
          }
        } else {
          cssText = preserveProperties ? node.cssText :
            this.removeCustomProps(node.cssText);
          cssText = cssText.trim();
          if (cssText) {
            cssText = '  ' + cssText + '\n';
          }
        }
      }
      // emit rule if there is cssText
      if (cssText) {
        if (node.selector) {
          text += node.selector + ' ' + this.OPEN_BRACE + '\n';
        }
        text += cssText;
        if (node.selector) {
          text += this.CLOSE_BRACE + '\n\n';
        }
      }
      return text;
    },

    _hasMixinRules: function(rules) {
      return rules[0].selector.indexOf(this.VAR_START) === 0;
    },

    removeCustomProps: function(cssText) {
      cssText = this.removeCustomPropAssignment(cssText);
      return this.removeCustomPropApply(cssText);
    },

    removeCustomPropAssignment: function(cssText) {
      return cssText
        .replace(this._rx.customProp, '')
        .replace(this._rx.mixinProp, '');
    },

    removeCustomPropApply: function(cssText) {
      return cssText
        .replace(this._rx.mixinApply, '')
        .replace(this._rx.varApply, '');
    },

    types: {
      STYLE_RULE: 1,
      KEYFRAMES_RULE: 7,
      MEDIA_RULE: 4,
      MIXIN_RULE: 1000
    },

    OPEN_BRACE: '{',
    CLOSE_BRACE: '}',

    // helper regexp's
    _rx: {
      comments: /\/\*[^*]*\*+([^/*][^*]*\*+)*\//gim,
      port: /@import[^;]*;/gim,
      customProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?(?:[;\n]|$)/gim,
      mixinProp:  /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?{[^}]*?}(?:[;\n]|$)?/gim,
      mixinApply: /\b@apply\b\s*\(?[^);]*?\)?\s*(?:[;\n]|$)?/gim,
      varApply: /[^;:]*?:[^;]*?var\([^;]*\)(?:[;\n]|$)?/gim,
      keyframesRule: /^@[^\s]*keyframes/,
      multipleSpaces: /\s+/g
    },

    VAR_START: '--',
    MEDIA_START: '@media',
    AT_START: '@'

  };

})();
Polymer.StyleUtil = (function() {

    return {
      // chrome 49 has semi-working css vars, check if box-shadow works
      // safari 9.1 has a recalc bug: https://bugs.webkit.org/show_bug.cgi?id=155782
      NATIVE_VARIABLES: Polymer.Settings.useNativeCSSProperties,
      MODULE_STYLES_SELECTOR: 'style, link[rel=import][type~=css], template',
      INCLUDE_ATTR: 'include',

      toCssText: function(rules, callback) {
        if (typeof rules === 'string') {
          rules = this.parser.parse(rules);
        }
        if (callback) {
          this.forEachRule(rules, callback);
        }
        return this.parser.stringify(rules, this.NATIVE_VARIABLES);
      },

      forRulesInStyles: function(styles, styleRuleCallback, keyframesRuleCallback) {
        if (styles) {
          for (var i=0, l=styles.length, s; (i<l) && (s=styles[i]); i++) {
            this.forEachRule(
                this.rulesForStyle(s),
                styleRuleCallback,
                keyframesRuleCallback);
          }
        }
      },

      rulesForStyle: function(style) {
        if (!style.__cssRules && style.textContent) {
          style.__cssRules =  this.parser.parse(style.textContent);
        }
        return style.__cssRules;
      },

      // Tests if a rule is a keyframes selector, which looks almost exactly
      // like a normal selector but is not (it has nothing to do with scoping
      // for example).
      isKeyframesSelector: function(rule) {
        return rule.parent &&
            rule.parent.type === this.ruleTypes.KEYFRAMES_RULE;
      },

      forEachRule: function(node, styleRuleCallback, keyframesRuleCallback) {
        if (!node) {
          return;
        }
        var skipRules = false;
        if (node.type === this.ruleTypes.STYLE_RULE) {
          styleRuleCallback(node);
        } else if (keyframesRuleCallback &&
                   node.type === this.ruleTypes.KEYFRAMES_RULE) {
          keyframesRuleCallback(node);
        } else if (node.type === this.ruleTypes.MIXIN_RULE) {
          skipRules = true;
        }
        var r$ = node.rules;
        if (r$ && !skipRules) {
          for (var i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
            this.forEachRule(r, styleRuleCallback, keyframesRuleCallback);
          }
        }
      },

      // add a string of cssText to the document.
      applyCss: function(cssText, moniker, target, contextNode) {
        var style = this.createScopeStyle(cssText, moniker);
        target = target || document.head;
        var after = (contextNode && contextNode.nextSibling) ||
          target.firstChild;
        this.__lastHeadApplyNode = style;
        return target.insertBefore(style, after);
      },

      createScopeStyle: function(cssText, moniker) {
        var style = document.createElement('style');
        if (moniker) {
          style.setAttribute('scope', moniker);
        }
        style.textContent = cssText;
        return style;
      },

      __lastHeadApplyNode: null,

      // insert a comment node as a styling position placeholder.
      applyStylePlaceHolder: function(moniker) {
        var placeHolder = document.createComment(' Shady DOM styles for ' +
          moniker + ' ');
        var after = this.__lastHeadApplyNode ?
          this.__lastHeadApplyNode.nextSibling : null;
        var scope = document.head;
        scope.insertBefore(placeHolder, after || scope.firstChild);
        this.__lastHeadApplyNode = placeHolder;
        return placeHolder;
      },

      cssFromModules: function(moduleIds, warnIfNotFound) {
        var modules = moduleIds.trim().split(' ');
        var cssText = '';
        for (var i=0; i < modules.length; i++) {
          cssText += this.cssFromModule(modules[i], warnIfNotFound);
        }
        return cssText;
      },

      // returns cssText of styles in a given module; also un-applies any
      // styles that apply to the document.
      cssFromModule: function(moduleId, warnIfNotFound) {
        var m = Polymer.DomModule.import(moduleId);
        if (m && !m._cssText) {
          m._cssText = this.cssFromElement(m);
        }
        if (!m && warnIfNotFound) {
          console.warn('Could not find style data in module named', moduleId);
        }
        return m && m._cssText || '';
      },

      // support lots of ways to discover css...
      cssFromElement: function(element) {
        var cssText = '';
        // if element is a template, get content from its .content
        var content = element.content || element;
        var e$ = Polymer.TreeApi.arrayCopy(
          content.querySelectorAll(this.MODULE_STYLES_SELECTOR));
        for (var i=0, e; i < e$.length; i++) {
          e = e$[i];
          // look inside templates for elements
          if (e.localName === 'template') {
            cssText += this.cssFromElement(e);
          } else {
            // style elements inside dom-modules will apply to the main document
            // we don't want this, so we remove them here.
            if (e.localName === 'style') {
              var include = e.getAttribute(this.INCLUDE_ATTR);
              // now support module refs on 'styling' elements
              if (include) {
                cssText += this.cssFromModules(include, true);
              }
              // get style element applied to main doc via HTMLImports polyfill
              e = e.__appliedElement || e;
              e.parentNode.removeChild(e);
              cssText += this.resolveCss(e.textContent, element.ownerDocument);
            // it's an import, assume this is a text file of css content.
            // TODO(sorvell): plan is to deprecate this way to get styles;
            // remember to add deprecation warning when this is done.
            } else if (e.import && e.import.body) {
              cssText += this.resolveCss(e.import.body.textContent, e.import);
            }
          }
        }
        return cssText;
      },

      rx: {
        VAR_ASSIGN: /(?:^|[;\s{]\s*)(--[\w-]*?)\s*:\s*(?:([^;{]*)|{([^}]*)})(?:(?=[;\s}])|$)/gi,
        MIXIN_MATCH: /(?:^|\W+)@apply[\s]*\(?([^);\n]*)\)?/gi,
        // note, this supports:
        // var(--a)
        // var(--a, --b)
        // var(--a, fallback-literal)
        // var(--a, fallback-literal(with-one-nested-parentheses))
        // var(--a, var(--b))
        // var(--a, var(--b, fallback-literal))
        // var(--a, var(--b, fallback-literal(with-one-nested-parentheses)))
        // var(--a, var(--b, var(--c, fallback-literal)))
        // var(--a, var(--b, var(--c, fallback-literal(with-one-nested-parentheses))))
        VAR_MATCH: /(^|\W+)var\([\s]*([^,)]*)[\s]*,?[\s]*((?:[^,()]*)|(?:[^;()]*\([^;)]*\)+))[\s]*?\)/gi,
        VAR_CAPTURE: /\([\s]*(--[^,\s)]*)(?:,[\s]*(?:var\(\s*)?(--[^,\s)]*)\)?)?(?:\)|,)/gi,
        ANIMATION_MATCH: /(animation\s*:)|(animation-name\s*:)/,
        IS_VAR: /^--/,
        BRACKETED: /\{[^}]*\}/g,
        HOST_PREFIX: '(?:^|[^.#[:])',
        HOST_SUFFIX: '($|[.:[\\s>+~])'
      },

      resolveCss: Polymer.ResolveUrl.resolveCss,
      parser: Polymer.CssParse,
      ruleTypes: Polymer.CssParse.types

    };

  })();
Polymer.StyleTransformer = (function() {

    var nativeShadow = Polymer.Settings.useNativeShadow;
    var styleUtil = Polymer.StyleUtil;

    /* Transforms ShadowDOM styling into ShadyDOM styling

     * scoping:

        * elements in scope get scoping selector class="x-foo-scope"
        * selectors re-written as follows:

          div button -> div.x-foo-scope button.x-foo-scope

     * :host -> scopeName

     * :host(...) -> scopeName...

     * ::content -> ' '

     * ::shadow, /deep/: processed similar to ::content

     * :host-context(...): scopeName..., ... scopeName

    */
    var api = {

      // Given a node and scope name, add a scoping class to each node
      // in the tree. This facilitates transforming css into scoped rules.
      dom: function(node, scope, useAttr, shouldRemoveScope) {
        this._transformDom(node, scope || '', useAttr, shouldRemoveScope);
      },

      _transformDom: function(node, selector, useAttr, shouldRemoveScope) {
        if (node.setAttribute) {
          this.element(node, selector, useAttr, shouldRemoveScope);
        }
        var c$ = Polymer.dom(node).childNodes;
        for (var i=0; i<c$.length; i++) {
          this._transformDom(c$[i], selector, useAttr, shouldRemoveScope);
        }
      },

      element: function(element, scope, useAttr, shouldRemoveScope) {
        if (useAttr) {
          if (shouldRemoveScope) {
            element.removeAttribute(SCOPE_NAME);
          } else {
            element.setAttribute(SCOPE_NAME, scope);
          }
        } else {
          // note: if using classes, we add both the general 'style-scope' class
          // as well as the specific scope. This enables easy filtering of all
          // `style-scope` elements
          if (scope) {
            // note: svg on IE does not have classList so fallback to class
            if (element.classList) {
              if (shouldRemoveScope) {
                element.classList.remove(SCOPE_NAME);
                element.classList.remove(scope);
              } else {
                element.classList.add(SCOPE_NAME);
                element.classList.add(scope);
              }
            } else if (element.getAttribute) {
              var c = element.getAttribute(CLASS);
              if (shouldRemoveScope) {
                if (c) {
                  element.setAttribute(CLASS, c.replace(SCOPE_NAME, '')
                    .replace(scope, ''));
                }
              } else {
                element.setAttribute(CLASS, (c ? c + ' ' : '') +
                  SCOPE_NAME + ' ' + scope);
              }
            }
          }
        }
      },

      elementStyles: function(element, callback) {
        var styles = element._styles;
        var cssText = '';
        for (var i=0, l=styles.length, s; (i<l) && (s=styles[i]); i++) {
          var rules = styleUtil.rulesForStyle(s);
          cssText += nativeShadow ?
            styleUtil.toCssText(rules, callback) :
            this.css(rules, element.is, element.extends, callback,
            element._scopeCssViaAttr) + '\n\n';
        }
        return cssText.trim();
      },

      // Given a string of cssText and a scoping string (scope), returns
      // a string of scoped css where each selector is transformed to include
      // a class created from the scope. ShadowDOM selectors are also transformed
      // (e.g. :host) to use the scoping selector.
      css: function(rules, scope, ext, callback, useAttr) {
        var hostScope = this._calcHostScope(scope, ext);
        scope = this._calcElementScope(scope, useAttr);
        var self = this;
        return styleUtil.toCssText(rules, function(rule) {
          if (!rule.isScoped) {
            self.rule(rule, scope, hostScope);
            rule.isScoped = true;
          }
          if (callback) {
            callback(rule, scope, hostScope);
          }
        });
      },

      _calcElementScope: function (scope, useAttr) {
        if (scope) {
          return useAttr ?
            CSS_ATTR_PREFIX + scope + CSS_ATTR_SUFFIX :
            CSS_CLASS_PREFIX + scope;
        } else {
          return '';
        }
      },

      _calcHostScope: function(scope, ext) {
        return ext ? '[is=' +  scope + ']' : scope;
      },

      rule: function (rule, scope, hostScope) {
        this._transformRule(rule, this._transformComplexSelector,
          scope, hostScope);
      },

      // transforms a css rule to a scoped rule.
      _transformRule: function(rule, transformer, scope, hostScope) {
        var p$ = rule.selector.split(COMPLEX_SELECTOR_SEP);
        // we want to skip transformation of rules that appear in keyframes,
        // because they are keyframe selectors, not element selectors.
        if (!styleUtil.isKeyframesSelector(rule)) {
          for (var i=0, l=p$.length, p; (i<l) && (p=p$[i]); i++) {
            p$[i] = transformer.call(this, p, scope, hostScope);
          }
        }
        // NOTE: save transformedSelector for subsequent matching of elements
        // against selectors (e.g. when calculating style properties)
        rule.selector = rule.transformedSelector =
          p$.join(COMPLEX_SELECTOR_SEP);
      },

      _transformComplexSelector: function(selector, scope, hostScope) {
        var stop = false;
        var hostContext = false;
        var self = this;
        selector = selector.replace(CONTENT_START, HOST + ' $1');
        selector = selector.replace(SIMPLE_SELECTOR_SEP, function(m, c, s) {
          if (!stop) {
            var info = self._transformCompoundSelector(s, c, scope, hostScope);
            stop = stop || info.stop;
            hostContext = hostContext || info.hostContext;
            c = info.combinator;
            s = info.value;
          } else {
            s = s.replace(SCOPE_JUMP, ' ');
          }
          return c + s;
        });
        if (hostContext) {
          selector = selector.replace(HOST_CONTEXT_PAREN,
            function(m, pre, paren, post) {
              return pre + paren + ' ' + hostScope + post +
                COMPLEX_SELECTOR_SEP + ' ' + pre + hostScope + paren + post;
             });
        }
        return selector;
      },

      _transformCompoundSelector: function(selector, combinator, scope, hostScope) {
        // replace :host with host scoping class
        var jumpIndex = selector.search(SCOPE_JUMP);
        var hostContext = false;
        if (selector.indexOf(HOST_CONTEXT) >=0) {
          hostContext = true;
        } else if (selector.indexOf(HOST) >=0) {
          // :host(...) -> scopeName...
          selector = selector.replace(HOST_PAREN, function(m, host, paren) {
            return hostScope + paren;
          });
          // now normal :host
          selector = selector.replace(HOST, hostScope);
        // replace other selectors with scoping class
        } else if (jumpIndex !== 0) {
          selector = scope ? this._transformSimpleSelector(selector, scope) :
            selector;
        }
        // remove left-side combinator when dealing with ::content.
        if (selector.indexOf(CONTENT) >= 0) {
          combinator = '';
        }
        // process scope jumping selectors up to the scope jump and then stop
        // e.g. .zonk ::content > .foo ==> .zonk.scope > .foo
        var stop;
        if (jumpIndex >= 0) {
          selector = selector.replace(SCOPE_JUMP, ' ');
          stop = true;
        }
        return {value: selector, combinator: combinator, stop: stop,
          hostContext: hostContext};
      },

      _transformSimpleSelector: function(selector, scope) {
        var p$ = selector.split(PSEUDO_PREFIX);
        p$[0] += scope;
        return p$.join(PSEUDO_PREFIX);
      },

      documentRule: function(rule) {
        // reset selector in case this is redone.
        rule.selector = rule.parsedSelector;
        this.normalizeRootSelector(rule);
        if (!nativeShadow) {
          this._transformRule(rule, this._transformDocumentSelector);
        }
      },

      normalizeRootSelector: function(rule) {
        if (rule.selector === ROOT) {
          rule.selector = 'html';
        }
      },

      _transformDocumentSelector: function(selector) {
        return selector.match(SCOPE_JUMP) ?
          this._transformComplexSelector(selector, SCOPE_DOC_SELECTOR) :
          this._transformSimpleSelector(selector.trim(), SCOPE_DOC_SELECTOR);
      },

      SCOPE_NAME: 'style-scope'
    };

    var SCOPE_NAME = api.SCOPE_NAME;
    var SCOPE_DOC_SELECTOR = ':not([' + SCOPE_NAME + '])' +
      ':not(.' + SCOPE_NAME + ')';
    var COMPLEX_SELECTOR_SEP = ',';
    var SIMPLE_SELECTOR_SEP = /(^|[\s>+~]+)((?:\[.+?\]|[^\s>+~=\[])+)/g;
    var HOST = ':host';
    var ROOT = ':root';
    // NOTE: this supports 1 nested () pair for things like
    // :host(:not([selected]), more general support requires
    // parsing which seems like overkill
    var HOST_PAREN = /(:host)(?:\(((?:\([^)(]*\)|[^)(]*)+?)\))/g;
    var HOST_CONTEXT = ':host-context';
    var HOST_CONTEXT_PAREN = /(.*)(?::host-context)(?:\(((?:\([^)(]*\)|[^)(]*)+?)\))(.*)/;
    var CONTENT = '::content';
    var SCOPE_JUMP = /::content|::shadow|\/deep\//;
    var CSS_CLASS_PREFIX = '.';
    var CSS_ATTR_PREFIX = '[' + SCOPE_NAME + '~=';
    var CSS_ATTR_SUFFIX = ']';
    var PSEUDO_PREFIX = ':';
    var CLASS = 'class';
    var CONTENT_START = new RegExp('^(' + CONTENT + ')');

    // exports
    return api;

  })();
Polymer.ApplyShim = (function(){
  'use strict';

  var styleUtil = Polymer.StyleUtil;

  var MIXIN_MATCH = styleUtil.rx.MIXIN_MATCH;
  var VAR_ASSIGN = styleUtil.rx.VAR_ASSIGN;
  var VAR_MATCH = styleUtil.rx.VAR_MATCH;
  var APPLY_NAME_CLEAN = /;\s*/m;

  // map of mixin to property names
  // --foo: {border: 2px} -> (--foo, {border: '2px'})
  var mixinMap = Object.create(null);

  function mapSet(name, prop) {
    name = name.trim();
    var old = mixinMap[name];
    if (old) {
      var reset = diff(old, prop);
      reset.forEach(function(r) {
        prop[r] = 'initial';
      })
    }
    mixinMap[name] = prop;
  }

  // get(--foo) -> '--foo-border: 2px;'
  function mapGet(name) {
    name = name.trim();
    return mixinMap[name];
  }

  function diff(oldProp, newProp) {
    var diff = [];
    Object.keys(oldProp).forEach(function(p) {
      if (!newProp[p]) {
        diff.push(p);
      }
    });
    return diff;
  }

  function flattenMixin(name, props) {
    return Object.keys(props).map(function(p){
      return name + '-' + p + ':' + props[p];
    }).join(';') + ';';
  }

  function applyVars(name, props, defaults) {
    return Object.keys(props).map(function(p){
      var fallback = defaults && defaults[p];
      var parts = [p, ': var(', name, '-', p];
      if (fallback) {
        parts.push(',', fallback);
      }
      parts.push(')');
      return parts.join('');
    }).join('; ');
  }

  function textToProps(text) {
    var props = text.split(';');
    var out = {};
    for (var i = 0, p, sp; i < props.length; i++) {
      p = props[i];
      if (p) {
        sp = p.split(':');
        if (sp.length >= 2) {
          out[sp[0].trim()] = sp.slice(1).map(function(n) {
            return n.trim();
          }).join(':');
        }
      }
    }
    return out;
  }

  function assign(all, name, property, mixin) {
    // handle case where property value is a mixin
    if (property) {
      property.replace(VAR_MATCH, function(all, prefix, value){
        if (mapGet(value)){
          mixin = '@apply ' + value + ';';
        }
      });
    }
    if (!mixin) {
      return all;
    }
    var defaults = collectDefaults(mixin);
    mixin = mixin.replace(MIXIN_MATCH, function(all, name) {
      return apply(all, name, defaults);
    });
    var prefix = all.slice(0, all.indexOf('--'));
    var subprops = textToProps(mixin);
    mapSet(name, subprops);
    return prefix + flattenMixin(name, subprops);
  }

  function apply(all, name, defaults) {
    var prefix = all.slice(0, all.indexOf('@apply'));
    name = name.replace(APPLY_NAME_CLEAN, '');
    var mixin = mapGet(name);
    var vars = '';
    if (mixin) {
      vars = applyVars(name, mixin, defaults) + ';';
    }
    return prefix + vars;
  }

  function collectDefaults(cssText) {
    return textToProps(cssText.replace(MIXIN_MATCH,
      function(all) {
        return all.slice(0, all.indexOf('@apply'));
      })
    );
  }

  // fix shim'd var syntax
  // var(--a, --b) -> var(--a, var(--b));
  function fixVars(all, prefix, value, fallback) {
    if (!fallback || fallback.indexOf('--') !== 0) {
      return all;
    }
    return prefix + 'var(' + value + ',var(' + fallback + '));';
  }

  return {
    transform: function(styles) {
      styleUtil.forRulesInStyles(styles, this.transformRule.bind(this));
    },
    transformRule: function(rule) {
      rule.cssText = this.transformCssText(rule.parsedCssText);
      // :root was only used for variable assignment in property shim,
      // but generates invalid selectors with real properties.
      // replace with `:host > *`, which serves the same effect
      if (rule.selector === ':root') {
        rule.selector = ':host > *';
      }
    },
    transformCssText: function(cssText) {
      // fix shim variables
      cssText = cssText.replace(VAR_MATCH, fixVars);
      // produce variables
      cssText = cssText.replace(VAR_ASSIGN, assign);
      var defaults = collectDefaults(cssText);
      // consume mixins
      cssText = cssText.replace(MIXIN_MATCH, function(all, name) {
        return apply(all, name, defaults);
      });
      return cssText;
    }
  };
})();