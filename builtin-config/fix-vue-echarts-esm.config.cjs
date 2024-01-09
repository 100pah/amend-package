#!/usr/bin/env node

module.exports = {

  amenderMap: {

    'vue-echarts': ({setPackageJSONAttr, ensureSubPackageJSON}) => {
      setPackageJSONAttr('type', 'module');
      setPackageJSONAttr('exports', {
        'import': './dist/index.esm.min.js'
      });
    },

    // vue-echarts uses resize-detector.
    // But throws SyntaxError:
    //  Named export 'addListener' not found. The requested module 'resize-detector' is a CommonJS module,
    //  which may not support all module.exports as named exports.
    'resize-detector': ({setPackageJSONAttr, ensureSubPackageJSON}) => {
      setPackageJSONAttr('type', 'module');
      setPackageJSONAttr('exports', {
        'import': './esm/index.js',
      });
    }

  },

}
