#!/usr/bin/env node

module.exports = {

  amenderMap: {

    'vue-echarts': ({setPkgJSONAttr, ensureSubPkgJSON}) => {
      setPkgJSONAttr('type', 'module');
      setPkgJSONAttr('exports', {
        'import': './dist/index.esm.min.js'
      });
    },

    // vue-echarts uses resize-detector.
    // But throws SyntaxError:
    //  Named export 'addListener' not found. The requested module 'resize-detector' is a CommonJS module,
    //  which may not support all module.exports as named exports.
    'resize-detector': ({setPkgJSONAttr, ensureSubPkgJSON}) => {
      setPkgJSONAttr('type', 'module');
      setPkgJSONAttr('exports', {
        'import': './esm/index.js',
      });
    }

  },

}
