const fs = require('node:fs');

const template = fs.readFileSync('src/viewer.html', 'utf8');
const css = fs.readFileSync('studio.css', 'utf8');
fs.writeFileSync('viewer/index.html', template.replace('/* STUDIO_CSS */', () => css));
