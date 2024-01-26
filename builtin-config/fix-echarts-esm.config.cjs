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

        // Entries below is only for backwork compatibility:

        "./lib/canvas/canvas": "./lib/canvas/canvas.js",
        "./lib/svg/svg": "./lib/svg/svg.js",
        "./lib/vml/vml": "./lib/vml/vml.js",
        "./lib/canvas/Painter": "./lib/canvas/Painter.js",
        "./lib/svg/Painter": "./lib/svg/Painter.js",
        "./lib/svg/patch": "./lib/svg/patch.js",
        "./lib/Storage": "./lib/Storage.js",
        "./lib/core/util": "./lib/core/util.js",
        "./lib/core/env": "./lib/core/env.js",
        "./lib/core/Transformable": "./lib/core/Transformable.js",
        "./lib/core/BoundingRect": "./lib/core/BoundingRect.js",
        "./lib/core/vector": "./lib/core/vector.js",
        "./lib/core/bbox": "./lib/core/bbox.js",
        "./lib/contain/polygon": "./lib/contain/polygon.js",
        "./lib/tool/color": "./lib/tool/color.js",
        "./lib/graphic/LinearGradient": "./lib/graphic/LinearGradient.js",
        "./lib/graphic/RadialGradient": "./lib/graphic/RadialGradient.js",

        "./*": "./*",
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
        "./theme/*": "./theme/*",
        "./i18n/*": "./i18n/*",
        "./ssr/client/index": {
          "types": "./ssr/client/index.d.ts",
          "import": "./ssr/client/index.js",
          "require": "./ssr/client/dist/index.js"
        },

        // Entries below is only for backwork compatibility:

        "./extension/dataTool": "./extension/dataTool/index.js",
        "./extension/dataTool/index": "./extension/dataTool/index.js",
        "./extension/dataTool/index.js": "./extension/dataTool/index.js",
        "./extension/dataTool/gexf": "./extension/dataTool/gexf.js",
        "./extension/dataTool/gexf.js": "./extension/dataTool/gexf.js",
        "./extension/dataTool/prepareBoxplotData": "./extension/dataTool/prepareBoxplotData.js",
        "./extension/dataTool/prepareBoxplotData.js": "./extension/dataTool/prepareBoxplotData.js",
        "./extension/bmap/bmap": "./extension/bmap/bmap.js",
        "./extension/bmap/bmap.js": "./extension/bmap/bmap.js",
        "./lib/echarts": "./lib/echarts.js",
        "./lib/echarts.js": "./lib/echarts.js",
        "./lib/extension": "./lib/extension.js",
        "./lib/extension.js": "./lib/extension.js",

        "./lib/chart/bar": "./lib/chart/bar.js",
        "./lib/chart/boxplot": "./lib/chart/boxplot.js",
        "./lib/chart/candlestick": "./lib/chart/candlestick.js",
        "./lib/chart/custom": "./lib/chart/custom.js",
        "./lib/chart/effectScatter": "./lib/chart/effectScatter.js",
        "./lib/chart/funnel": "./lib/chart/funnel.js",
        "./lib/chart/gauge": "./lib/chart/gauge.js",
        "./lib/chart/graph": "./lib/chart/graph.js",
        "./lib/chart/heatmap": "./lib/chart/heatmap.js",
        "./lib/chart/line": "./lib/chart/line.js",
        "./lib/chart/lines": "./lib/chart/lines.js",
        "./lib/chart/map": "./lib/chart/map.js",
        "./lib/chart/parallel": "./lib/chart/parallel.js",
        "./lib/chart/pictorialBar": "./lib/chart/pictorialBar.js",
        "./lib/chart/pie": "./lib/chart/pie.js",
        "./lib/chart/radar": "./lib/chart/radar.js",
        "./lib/chart/sankey": "./lib/chart/sankey.js",
        "./lib/chart/scatter": "./lib/chart/scatter.js",
        "./lib/chart/sunburst": "./lib/chart/sunburst.js",
        "./lib/chart/themeRiver": "./lib/chart/themeRiver.js",
        "./lib/chart/tree": "./lib/chart/tree.js",
        "./lib/chart/treemap": "./lib/chart/treemap.js",

        "./lib/component/aria": "./lib/component/aria.js",
        "./lib/component/axisPointer": "./lib/component/axisPointer.js",
        "./lib/component/brush": "./lib/component/brush.js",
        "./lib/component/calendar": "./lib/component/calendar.js",
        "./lib/component/dataZoom": "./lib/component/dataZoom.js",
        "./lib/component/dataZoomInside": "./lib/component/dataZoomInside.js",
        "./lib/component/dataZoomSelect": "./lib/component/dataZoomSelect.js",
        "./lib/component/dataZoomSlider": "./lib/component/dataZoomSlider.js",
        "./lib/component/dataset": "./lib/component/dataset.js",
        "./lib/component/geo": "./lib/component/geo.js",
        "./lib/component/graphic": "./lib/component/graphic.js",
        "./lib/component/grid": "./lib/component/grid.js",
        "./lib/component/gridSimple": "./lib/component/gridSimple.js",
        "./lib/component/legend": "./lib/component/legend.js",
        "./lib/component/legendPlain": "./lib/component/legendPlain.js",
        "./lib/component/legendScroll": "./lib/component/legendScroll.js",
        "./lib/component/markArea": "./lib/component/markArea.js",
        "./lib/component/markLine": "./lib/component/markLine.js",
        "./lib/component/markPoint": "./lib/component/markPoint.js",
        "./lib/component/parallel": "./lib/component/parallel.js",
        "./lib/component/polar": "./lib/component/polar.js",
        "./lib/component/radar": "./lib/component/radar.js",
        "./lib/component/singleAxis": "./lib/component/singleAxis.js",
        "./lib/component/timeline": "./lib/component/timeline.js",
        "./lib/component/title": "./lib/component/title.js",
        "./lib/component/toolbox": "./lib/component/toolbox.js",
        "./lib/component/tooltip": "./lib/component/tooltip.js",
        "./lib/component/transform": "./lib/component/transform.js",
        "./lib/component/visualMap": "./lib/component/visualMap.js",
        "./lib/component/visualMapContinuous": "./lib/component/visualMapContinuous.js",
        "./lib/component/visualMapPiecewise": "./lib/component/visualMapPiecewise.js",

        "./*": "./*",
      });

      ensureSubPackageJSON(['dist'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
      ensureSubPackageJSON(['build'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
      ensureSubPackageJSON(['i18n'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
      ensureSubPackageJSON(['theme'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
    },

  },

};
