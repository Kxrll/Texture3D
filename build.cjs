const fs = require('node:fs');
const esbuild = require('esbuild');
require('./restyle.cjs');
fs.writeFileSync('src/cube-data.js', 'export default ' + JSON.stringify(fs.readFileSync('assets/cube.glb').toString('base64')) + ';\n');
esbuild.buildSync({entryPoints:['src/viewer.js'],bundle:true,outfile:'viewer/viewer.js',format:'iife',target:'chrome110',minify:true,legalComments:'eof'});
