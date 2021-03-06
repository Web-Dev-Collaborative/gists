"use strict";

exports.__esModule = true;

exports.default = function (_ref) {
  var t = _ref.types;

  function hasRestProperty(node) {
    for (var _iterator = node.properties, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
      var _ref2;

      if (_isArray) {
        if (_i >= _iterator.length) break;
        _ref2 = _iterator[_i++];
      } else {
        _i = _iterator.next();
        if (_i.done) break;
        _ref2 = _i.value;
      }

      var property = _ref2;

      if (t.isRestProperty(property)) {
        return true;
      }
    }

    return false;
  }

  function variableDeclarationHasRestProperty(node) {
    for (var _iterator2 = node.declarations, _isArray2 = Array.isArray(_iterator2), _i2 = 0, _iterator2 = _isArray2 ? _iterator2 : _iterator2[Symbol.iterator]();;) {
      var _ref3;

      if (_isArray2) {
        if (_i2 >= _iterator2.length) break;
        _ref3 = _iterator2[_i2++];
      } else {
        _i2 = _iterator2.next();
        if (_i2.done) break;
        _ref3 = _i2.value;
      }

      var declar = _ref3;

      if (t.isObjectPattern(declar.id)) {
        return hasRestProperty(declar.id);
      }
    }
    return false;
  }

  function hasSpread(node) {
    for (var _iterator3 = node.properties, _isArray3 = Array.isArray(_iterator3), _i3 = 0, _iterator3 = _isArray3 ? _iterator3 : _iterator3[Symbol.iterator]();;) {
      var _ref4;

      if (_isArray3) {
        if (_i3 >= _iterator3.length) break;
        _ref4 = _iterator3[_i3++];
      } else {
        _i3 = _iterator3.next();
        if (_i3.done) break;
        _ref4 = _i3.value;
      }

      var prop = _ref4;

      if (t.isSpreadProperty(prop)) {
        return true;
      }
    }
    return false;
  }

  function createObjectSpread(file, props, objRef) {
    var restProperty = props.pop();

    var keys = [];
    for (var _iterator4 = props, _isArray4 = Array.isArray(_iterator4), _i4 = 0, _iterator4 = _isArray4 ? _iterator4 : _iterator4[Symbol.iterator]();;) {
      var _ref5;

      if (_isArray4) {
        if (_i4 >= _iterator4.length) break;
        _ref5 = _iterator4[_i4++];
      } else {
        _i4 = _iterator4.next();
        if (_i4.done) break;
        _ref5 = _i4.value;
      }

      var prop = _ref5;

      var key = prop.key;
      if (t.isIdentifier(key) && !prop.computed) {
        key = t.stringLiteral(prop.key.name);
      }
      keys.push(key);
    }

    return [restProperty.argument, t.callExpression(file.addHelper("objectWithoutProperties"), [objRef, t.arrayExpression(keys)])];
  }

  function replaceRestProperty(paramsPath, i, numParams) {
    if (paramsPath.isObjectPattern() && hasRestProperty(paramsPath.node)) {
      var parentPath = paramsPath.parentPath;
      var uid = parentPath.scope.generateUidIdentifier("ref");

      var declar = t.variableDeclaration("let", [t.variableDeclarator(paramsPath.node, uid)]);
      declar._blockHoist = i ? numParams - i : 1;

      parentPath.ensureBlock();
      parentPath.get("body").unshiftContainer("body", declar);
      paramsPath.replaceWith(uid);
    }
  }

  return {
    inherits: require("babel-plugin-syntax-object-rest-spread"),

    visitor: {
      // taken from transform-es2015-parameters/src/destructuring.js
      // function a({ b, ...c }) {}
      Function: function Function(path) {
        var params = path.get("params");
        for (var i = 0; i < params.length; i++) {
          replaceRestProperty(params[i], i, params.length);
        }
      },

      // adapted from transform-es2015-destructuring/src/index.js#pushObjectRest
      // const { a, ...b } = c;
      VariableDeclarator: function VariableDeclarator(path, file) {
        if (!path.get("id").isObjectPattern()) {
          return;
        }
        var kind = path.parentPath.node.kind;
        var nodes = [];

        path.traverse({
          RestProperty: function RestProperty(path) {
            var ref = this.originalPath.node.init;

            path.findParent(function (path) {
              if (path.isObjectProperty()) {
                ref = t.memberExpression(ref, t.identifier(path.node.key.name));
              } else if (path.isVariableDeclarator()) {
                return true;
              }
            });

            var _createObjectSpread = createObjectSpread(file, path.parentPath.node.properties, ref),
                argument = _createObjectSpread[0],
                callExpression = _createObjectSpread[1];

            nodes.push(t.variableDeclarator(argument, callExpression));

            if (path.parentPath.node.properties.length === 0) {
              path.findParent(function (path) {
                return path.isObjectProperty() || path.isVariableDeclaration();
              }).remove();
            }
          }
        }, {
          originalPath: path
        });

        if (nodes.length > 0) {
          path.parentPath.getSibling(path.parentPath.key + 1).insertBefore(t.variableDeclaration(kind, nodes));
        }
      },

      // taken from transform-es2015-destructuring/src/index.js#visitor
      // export var { a, ...b } = c;
      ExportNamedDeclaration: function ExportNamedDeclaration(path) {
        var declaration = path.get("declaration");
        if (!declaration.isVariableDeclaration()) return;
        if (!variableDeclarationHasRestProperty(declaration.node)) return;

        var specifiers = [];

        for (var name in path.getOuterBindingIdentifiers(path)) {
          var id = t.identifier(name);
          specifiers.push(t.exportSpecifier(id, id));
        }

        // Split the declaration and export list into two declarations so that the variable
        // declaration can be split up later without needing to worry about not being a
        // top-level statement.
        path.replaceWith(declaration.node);
        path.insertAfter(t.exportNamedDeclaration(null, specifiers));
      },

      // try {} catch ({a, ...b}) {}
      CatchClause: function CatchClause(path) {
        replaceRestProperty(path.get("param"));
      },

      // ({a, ...b} = c);
      AssignmentExpression: function AssignmentExpression(path, file) {
        var leftPath = path.get("left");
        if (leftPath.isObjectPattern() && hasRestProperty(leftPath.node)) {
          var nodes = [];

          var ref = void 0;
          if (path.isCompletionRecord() || path.parentPath.isExpressionStatement()) {
            ref = path.scope.generateUidIdentifierBasedOnNode(path.node.right, "ref");

            nodes.push(t.variableDeclaration("var", [t.variableDeclarator(ref, path.node.right)]));
          }

          var _createObjectSpread2 = createObjectSpread(file, path.node.left.properties, ref),
              argument = _createObjectSpread2[0],
              callExpression = _createObjectSpread2[1];

          var nodeWithoutSpread = t.clone(path.node);
          nodeWithoutSpread.right = ref;
          nodes.push(t.expressionStatement(nodeWithoutSpread));
          nodes.push(t.assignmentExpression("=", argument, callExpression));

          if (ref) {
            nodes.push(t.expressionStatement(ref));
          }

          path.replaceWithMultiple(nodes);
        }
      },

      // taken from transform-es2015-destructuring/src/index.js#visitor
      ForXStatement: function ForXStatement(path) {
        var node = path.node,
            scope = path.scope;

        var left = node.left;

        // for ({a, ...b} of []) {}
        if (t.isObjectPattern(left) && hasRestProperty(left)) {
          var temp = scope.generateUidIdentifier("ref");

          node.left = t.variableDeclaration("var", [t.variableDeclarator(temp)]);

          path.ensureBlock();

          node.body.body.unshift(t.variableDeclaration("var", [t.variableDeclarator(left, temp)]));

          return;
        }

        if (!t.isVariableDeclaration(left)) return;

        var pattern = left.declarations[0].id;
        if (!t.isObjectPattern(pattern)) return;

        var key = scope.generateUidIdentifier("ref");
        node.left = t.variableDeclaration(left.kind, [t.variableDeclarator(key, null)]);

        path.ensureBlock();

        node.body.body.unshift(t.variableDeclaration(node.left.kind, [t.variableDeclarator(pattern, key)]));
      },

      // var a = { ...b, ...c }
      ObjectExpression: function ObjectExpression(path, file) {
        if (!hasSpread(path.node)) return;

        var useBuiltIns = file.opts.useBuiltIns || false;
        if (typeof useBuiltIns !== "boolean") {
          throw new Error("transform-object-rest-spread currently only accepts a boolean option for useBuiltIns (defaults to false)");
        }

        var args = [];
        var props = [];

        function push() {
          if (!props.length) return;
          args.push(t.objectExpression(props));
          props = [];
        }

        for (var _iterator5 = path.node.properties, _isArray5 = Array.isArray(_iterator5), _i5 = 0, _iterator5 = _isArray5 ? _iterator5 : _iterator5[Symbol.iterator]();;) {
          var _ref6;

          if (_isArray5) {
            if (_i5 >= _iterator5.length) break;
            _ref6 = _iterator5[_i5++];
          } else {
            _i5 = _iterator5.next();
            if (_i5.done) break;
            _ref6 = _i5.value;
          }

          var prop = _ref6;

          if (t.isSpreadProperty(prop)) {
            push();
            args.push(prop.argument);
          } else {
            props.push(prop);
          }
        }

        push();

        if (!t.isObjectExpression(args[0])) {
          args.unshift(t.objectExpression([]));
        }

        var helper = useBuiltIns ? t.memberExpression(t.identifier("Object"), t.identifier("assign")) : file.addHelper("extends");

        path.replaceWith(t.callExpression(helper, args));
      }
    }
  };
};