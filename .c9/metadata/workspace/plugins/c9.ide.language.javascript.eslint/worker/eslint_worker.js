{"changed":false,"filter":false,"title":"eslint_worker.js","tooltip":"/plugins/c9.ide.language.javascript.eslint/worker/eslint_worker.js","value":"/**\r\n * Cloud9 Language Foundation\r\n *\r\n * @copyright 2013, Ajax.org B.V.\r\n */\r\ndefine(function(require, exports, module) {\r\n\r\nvar baseLanguageHandler = require('plugins/c9.ide.language/base_handler');\r\nvar workerUtil = require('plugins/c9.ide.language/worker_util');\r\n// var acorn = require(\"acorn/dist/acorn\");\r\nvar linter = require(\"./eslint_browserified\");\r\nvar handler = module.exports = Object.create(baseLanguageHandler);\r\nvar util = require(\"plugins/c9.ide.language/worker_util\");\r\nvar yaml = require(\"./js-yaml\");\r\nvar stripJsonComments = require(\"./strip-json-comments\");\r\n\r\nvar defaultRules;\r\nvar defaultEnv = {\r\n    \"browser\": false,\r\n    \"amd\": true,\r\n    \"builtin\": true,\r\n    \"node\": true,\r\n    \"jasmine\": false,\r\n    \"mocha\": true,\r\n    \"es6\": true,\r\n    \"jquery\": false,\r\n    \"meteor\": false,\r\n};\r\nvar defaultParserOptions = {\r\n    ecmaFeatures: {\r\n        globalReturn: true, // allow return statements in the global scope\r\n        jsx: true, // enable JSX\r\n        experimentalObjectRestSpread: true\r\n    },\r\n    ecmaVersion: 6,\r\n    // sourceType: \"module\"\r\n};\r\nvar defaultGlobals = require(\"plugins/c9.ide.language.javascript/scope_analyzer\").GLOBALS;\r\nvar userConfig;\r\nvar userConfigRaw;\r\n\r\nhandler.init = function(callback) {\r\n    var rules = defaultRules = {};\r\n    \r\n    rules[\"handle-callback-err\"] = 1;\r\n    rules[\"no-debugger\"] = 1;\r\n    rules[\"no-undef\"] = 1;\r\n    // too buggy:\r\n    // rules[\"no-use-before-define\"] = [3, \"nofunc\"];\r\n    // to annoying:\r\n    // rules[\"no-shadow\"] = 3;\r\n    rules[\"no-inner-declarations\"] = [1, \"functions\"];\r\n    rules[\"no-native-reassign\"] = 1;\r\n    rules[\"no-new-func\"] = 1;\r\n    rules[\"no-new-wrappers\"] = 1;\r\n    rules[\"no-cond-assign\"] = [1, \"except-parens\"];\r\n    rules[\"no-debugger\"] = 3;\r\n    rules[\"no-dupe-keys\"] = 3;\r\n    rules[\"no-eval\"] = 1;\r\n    rules[\"no-func-assign\"] = 1;\r\n    rules[\"no-extra-semi\"] = 3;\r\n    rules[\"no-invalid-regexp\"] = 1;\r\n    rules[\"no-irregular-whitespace\"] = 3;\r\n    rules[\"no-negated-in-lhs\"] = 1;\r\n    rules[\"no-regex-spaces\"] = 3;\r\n    rules[\"quote-props\"] = 0;\r\n    rules[\"no-unreachable\"] = 1;\r\n    rules[\"use-isnan\"] = 2;\r\n    rules[\"valid-typeof\"] = 1;\r\n    rules[\"no-redeclare\"] = 3;\r\n    rules[\"no-with\"] = 1;\r\n    rules[\"radix\"] = 3;\r\n    rules[\"no-delete-var\"] = 2;\r\n    rules[\"no-label-var\"] = 3;\r\n    rules[\"no-shadow-restricted-names\"] = 2;\r\n    rules[\"handle-callback-err\"] = 1;\r\n    rules[\"no-new-require\"] = 2;\r\n\r\n    for (var r in rules) {\r\n        if (!(r in linter.defaults().rules))\r\n            throw new Error(\"Unknown rule: \", r);\r\n    }\r\n    \r\n    loadConfigFile(true, function(err) {\r\n        if (err) console.error(err);\r\n        util.$watchDir(\"/\", handler);\r\n        util.$onWatchDirChange(onWorkspaceDirChange);\r\n    });\r\n    \r\n    callback();\r\n};\r\n\r\nfunction onWorkspaceDirChange(e) {\r\n    e.data.files.forEach(function(f) {\r\n        if (f.name === \".eslintrc\")\r\n            loadConfigFile();\r\n    });\r\n}\r\n\r\nfunction loadConfigFile(initialLoad, callback) {\r\n    util.readFile(\"/.eslintrc\", \"utf-8\", function onResult(err, data) {\r\n        if (err) return loadConfig(err);\r\n        \r\n        if (data === userConfigRaw)\r\n            return callback && callback();\r\n\r\n        userConfigRaw = data;\r\n        var result;\r\n        try {\r\n            result = yaml.safeLoad(stripJsonComments(data));\r\n        }\r\n        catch (e) {\r\n            // TODO: show error marker in .eslintrc file?\r\n            return loadConfig(e);\r\n        }\r\n        loadConfig(null, result);\r\n    });\r\n    \r\n    function loadConfig(err, result) {\r\n        if (err && !callback)\r\n            util.showError(err);\r\n        userConfig = result;\r\n        if (userConfig && userConfig.rules && userConfig.rules[\"semi\"] != undefined)\r\n            userConfig.semi = true;\r\n        if (!initialLoad)\r\n            util.refreshAllMarkers();\r\n        callback && callback();\r\n    }\r\n}\r\n\r\nhandler.handlesLanguage = function(language) {\r\n    return language === \"javascript\" || language == \"jsx\";\r\n};\r\n\r\nhandler.analyze = function(value, ast, options, callback) {\r\n    if (options.minimalAnalysis)\r\n        return callback();\r\n    callback(handler.analyzeSync(value, ast, options.path));\r\n};\r\n\r\nhandler.getMaxFileSizeSupported = function() {\r\n    // .5 of current base_handler default\r\n    return .5 * 10 * 1000 * 80;\r\n};\r\n\r\nhandler.analyzeSync = function(value, ast, path) {\r\n    var doc = this.doc;\r\n    var markers = [];\r\n    if (!workerUtil.isFeatureEnabled(\"hints\"))\r\n        return markers;\r\n\r\n    var config = this.isFeatureEnabled(\"eslintrc\") && userConfig || {};\r\n\r\n    delete config.parser; // we only support espree\r\n\r\n    config.rules = config.rules || defaultRules;\r\n    config.env = config.env || defaultEnv;\r\n    config.globals = config.globals || defaultGlobals;\r\n    config.parserOptions = config.parserOptions || defaultParserOptions;\r\n    if (config.parserOptions.ecmaVersion == undefined)\r\n        config.parserOptions.ecmaVersion = 7;\r\n    if (config.parserOptions.ecmaFeatures == undefined)\r\n        config.parserOptions.ecmaFeatures = defaultParserOptions.ecmaFeatures;\r\n    if (config.parserOptions.ecmaFeatures.experimentalObjectRestSpread == undefined)\r\n        config.parserOptions.ecmaFeatures.experimentalObjectRestSpread = true;\r\n\r\n    config.rules[\"no-unused-vars\"] = [\r\n        3,\r\n        {\r\n            vars: \"all\",\r\n            args: handler.isFeatureEnabled(\"unusedFunctionArgs\") ? \"all\" : \"none\"\r\n        }\r\n    ];\r\n    config.rules[\"jsx-uses-vars\"] = 2;\r\n    config.rules[\"no-undef\"] =\r\n        handler.isFeatureEnabled(\"undeclaredVars\") ? 1 : 0;\r\n    \r\n    if (!config.semi) {\r\n        config.rules[\"semi\"] =\r\n            handler.isFeatureEnabled(\"semi\") ? 3 : 0;\r\n    }\r\n\r\n    var isJson = this.path.match(/\\.(json|run|settings|build)$/);\r\n    if (isJson)\r\n        value = \"!\" + value;\r\n\r\n    try {\r\n        var messages = linter.verify(value, config);\r\n    }\r\n    catch (e) {\r\n        console.error(e.stack);\r\n        if (e.message && e.message.match(/rule .* was not found/))\r\n            workerUtil.showError(\"eslint: \" + e.message);\r\n        return [];\r\n    }\r\n    \r\n    messages.forEach(function(m) {\r\n        var level;\r\n        if (m.severity === 2)\r\n            level = \"error\";\r\n        else if (m.severity === 1)\r\n            level = \"warning\";\r\n        else\r\n            level = \"info\";\r\n        \r\n        if (isJson && level !== \"error\")\r\n            return;\r\n\r\n        if (m.message.match(/'([^']*)' is defined but never used/)) {\r\n            if (RegExp.$1.toUpperCase() === RegExp.$1 && RegExp.$1.toLowerCase() !== RegExp.$1)\r\n                return; // ignore unused constants\r\n        }\r\n        \r\n        // work around column offset bug\r\n        m.column--;\r\n\r\n        var ec;\r\n        if (m.message.match(/is not defined|was used before it was defined|is already declared|is already defined|unexpected identifier|defined but never used/i)) {\r\n            var line = doc.getLine(m.line);\r\n            var id = workerUtil.getFollowingIdentifier(line, m.column);\r\n            if (m.message.match(/is already defined/) && line.match(\"for \\\\(var \" + id))\r\n                return;\r\n            ec = m.column + id.length;\r\n        }\r\n        if (m.message.match(/'([^']*)' is not defined/)) {\r\n            // TODO: quickfix :)\r\n            m.message = RegExp.$1 + \" is not defined; please fix or add /*global \" + RegExp.$1 + \"*/\";\r\n        }\r\n        if (m.message.match(/missing semicolon/i)) {\r\n            var line = doc.getLine(m.line);\r\n            if (line.substr(m.column).match(/\\s*}/))\r\n                return; // allow missing semi at end of block\r\n            // HACK: allow missing semi at end of aura definitions\r\n            if ((m.line === doc.getLength() || m.line === doc.getLength() - 1)\r\n                && line.match(/^\\s*\\}\\)\\s*$/))\r\n                return;\r\n        }\r\n            \r\n        markers.push({\r\n            pos: {\r\n                sl: m.line,\r\n                sc: m.column,\r\n                ec: ec\r\n            },\r\n            type: level,\r\n            level: level !== \"info\" && level,\r\n            message: m.message\r\n        });\r\n    });\r\n    return markers;\r\n};\r\n    \r\n});\r\n","undoManager":{"mark":-1,"position":-1,"stack":[]},"ace":{"folds":[],"scrolltop":0,"scrollleft":0,"selection":{"start":{"row":226,"column":33},"end":{"row":226,"column":38},"isBackwards":false},"options":{"guessTabSize":true,"useWrapMode":false,"wrapToView":true},"firstLineState":0},"timestamp":1472126172400}