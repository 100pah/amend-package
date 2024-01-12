#!/usr/bin/env node

module.exports = {

  amenderMap: {

    'zrender': ({setPackageJSONAttr, ensureSubPackageJSON, getPackageJSONAttrClone}) => {
      // Detect the package version that after exports added.
      if (getPackageJSONAttrClone('exports')) {
        return;
      }
      setPackageJSONAttr('type', 'module');
      setPackageJSONAttr('exports', {
        ".": {
            "types": "./index.d.ts",
            "require": "./dist/zrender.js",
            "import": "./index.js"
        },
        "./*.js": "./*.js",
        "./*.ts": "./*.ts",
        "./*.json": "./*.json",
        "./*": "./*.js",
      });
      ensureSubPackageJSON(['dist'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
      ensureSubPackageJSON(['build'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
    },

    'echarts': ({setPackageJSONAttr, ensureSubPackageJSON, getPackageJSONAttrClone}) => {
      // Detect the package version that after exports added.
      if (getPackageJSONAttrClone('exports')) {
        return;
      }
      setPackageJSONAttr('type', 'module');
      setPackageJSONAttr('exports', {
        ".": {
          "types": "./index.d.ts",
          "import": "./index.js",
          "require": "./dist/echarts.js",
        },
        "./core": "./core.js",
        "./core.js": "./core.js",
        "./charts": "./charts.js",
        "./charts.js": "./charts.js",
        "./components": "./components.js",
        "./components.js": "./components.js",
        "./features": "./features.js",
        "./features.js": "./features.js",
        "./renderers": "./renderers.js",
        "./renderers.js": "./renderers.js",
        "./index.blank": "./index.blank.js",
        "./index.blank.js": "./index.blank.js",
        "./index.common": "./index.common.js",
        "./index.common.js": "./index.common.js",
        "./index.simple": "./index.simple.js",
        "./index.simple.js": "./index.simple.js",
        "./index": "./index.js",
        "./index.js": "./index.js",
        "./extension/dataTool": "./extension/dataTool/index.js",
        "./extension/dataTool/index": "./extension/dataTool/index.js",
        "./extension/dataTool/index.js": "./extension/dataTool/index.js",
        "./extension/bmap/bmap": "./extension/bmap/bmap.js",
        "./extension/bmap/bmap.js": "./extension/bmap/bmap.js",
        "./lib/echarts": "./lib/echarts.js",
        "./lib/echarts.js": "./lib/echarts.js",
        "./lib/extension": "./lib/extension.js",
        "./lib/extension.js": "./lib/extension.js",
        "./*.js": "./*.js",
        "./*.ts": "./*.ts",
        "./*.json": "./*.json",
        "./*": "./*.js",
      });

      ensureSubPackageJSON(['dist'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
      ensureSubPackageJSON(['build'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
      ensureSubPackageJSON(['i18n'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
      ensureSubPackageJSON(['theme'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
    },

  },

};
