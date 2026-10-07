`echarts.js` is Apache ECharts 6.0 (Apache-2.0), cut down to bar, line, pie, gauge and heatmap charts with the SVG
renderer, and bundled to one ES module. A mod can't import from npm, so the build lives here.

Rebuild it:

    npm i echarts@6 esbuild
    cp echarts.entry.js.txt entry.js
    npx esbuild entry.js --bundle --format=esm --minify --target=es2022 --legal-comments=none --outfile=echarts.js
