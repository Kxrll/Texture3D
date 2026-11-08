const fs=require('node:fs');
let html=fs.readFileSync('viewer/index.html','utf8');
const icon=(path)=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
if(!html.includes('id="topbar"')){
 html=html.replace('<aside id="sidebar">','<header id="topbar"><div class="brand"><span class="brand-mark">◇</span>Texture 3D<span class="tag">STUDIO</span></div><div class="divider"></div><span id="model-name">Cube.glb</span><span id="host-state">Connexion à Photoshop</span><button id="toggle" title="Afficher ou masquer les commandes" aria-label="Masquer les commandes">Panneau</button></header><aside id="sidebar">');
 html=html.replace('<button id="toggle">Masquer les commandes</button>','');
 const sidebar=`<section><h2 class="section-title"><span class="step">01</span> DOCUMENT</h2><div id="document-name">Aucun document associé</div><button id="associate" disabled>${icon('M9 15l6-6m-7 3-2 2a4 4 0 0 0 6 6l3-3m-3-9 2-2a4 4 0 0 1 6 6l-3 3')}Associer le document actif</button><p class="caption">Le document ouvert dans Photoshop devient la texture du modèle.</p></section>
 <section><h2 class="section-title"><span class="step">02</span> MODÈLE</h2><button id="import-external" disabled>${icon('M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5')}Importer un modèle GLB…</button><input id="model-file" type="file" accept=".glb"><div class="backgrounds"><span>Fond de la vue</span><button data-bg="15101f" style="background:#15101f" aria-label="Fond sombre" aria-pressed="true" title="Violet sombre"></button><button data-bg="55545d" style="background:#55545d" aria-label="Fond gris" aria-pressed="false" title="Gris neutre"></button><button data-bg="e3e0e9" style="background:#e3e0e9" aria-label="Fond clair" aria-pressed="false" title="Clair"></button></div></section>
 <section><h2 class="section-title"><span class="step">03</span> SYNCHRONISATION</h2><label class="switch-row">Actualiser à l’enregistrement<input id="auto-external" type="checkbox" checked disabled></label><button id="refresh-external" disabled>${icon('M20 8a8 8 0 1 0 0 8M20 3v5h-5')}Actualiser la texture</button><div id="bridge-status" role="status">Connexion à Photoshop…</div></section>
 <section class="export-section"><h2 class="section-title">TRANSFÉRER LE MODÈLE</h2><button id="blender" class="primary">${icon('M5 19 19 5M7 5h12v12')}Envoyer dans Blender</button><p class="caption">Modèle, texture et matériau prêts à utiliser.</p><div id="export-status" role="status"></div></section>`;
 html=html.replace(/(<aside id="sidebar">)[\s\S]*?(<\/aside>)/,'$1'+sidebar+'$2');
 html=html.replace('<span id="connection">Connexion à Photoshop…</span>','');
 html=html.replace('<script src="viewer.js">','<footer id="footer"><span class="footer-note">TEXTURE 3D / ESPACE DE CRÉATION</span><span id="connection">Connexion à Photoshop…</span></footer><script src="viewer.js">');
}
html=html.replace(/<button id="import-external"[^>]*>[\s\S]*?<\/button>/g,'');
// Build the sidebar every time, so wording and order stay consistent after rebuilds.
const readableSidebar=`
<section class="document-card"><div class="card-heading"><span class="document-symbol">${icon('M14 2H6a2 2 0 0 0-2 2v16h16V8zM14 2v6h6M8 13h8M8 17h5')}</span><div><h2 class="section-title">Document actif</h2><span class="small-label">Depuis Photoshop</span></div></div><div id="document-name">Aucun document associé</div><label id="texture-set-row" hidden>Texture<select id="texture-set" aria-label="Matériau à peindre"></select></label><button id="associate" disabled>${icon('M9 15l6-6m-7 3-2 2a4 4 0 0 0 6 6l3-3m-3-9 2-2a4 4 0 0 1 6 6l-3 3')}Associer le document actif</button><p class="caption"></p><div class="connection-note"><div id="bridge-status" role="status">Connexion à Photoshop…</div></div></section>
<section class="export-section action-card"><p class="caption" hidden></p><button id="blender" class="primary">${icon('M5 19 19 5M7 5h12v12')}Envoyer dans Blender</button><button id="refresh-external" disabled>${icon('M20 8a8 8 0 1 0 0 8M20 3v5h-5')}Actualiser la texture</button><div id="export-status" role="status"></div></section>
<section class="sync-preference" hidden><label class="switch-row"><span>Suivre mes enregistrements<small>La vue se met à jour avec Ctrl + S</small></span><input id="auto-external" type="checkbox" checked disabled></label></section>
<section class="appearance-section"><div class="backgrounds"><span>Ambiance de la vue</span><button data-bg="15101f" style="background:#15101f" aria-label="Fond sombre" aria-pressed="true" title="Sombre"></button><button data-bg="55545d" style="background:#55545d" aria-label="Fond gris" aria-pressed="false" title="Gris neutre"></button><button data-bg="e3e0e9" style="background:#e3e0e9" aria-label="Fond clair" aria-pressed="false" title="Beige"></button></div></section>`;
html=html.replace(/(<aside id="sidebar">)[\s\S]*?(<\/aside>)/,'$1'+readableSidebar+'$2');
html=html.replace(/<span class="footer-note">[\s\S]*?<\/span>/,'');
html=html.replace('aria-expanded="false">?</button>','aria-expanded="false">Aide</button>');
html=html.replace('<html>','<html lang="fr">');
if(!html.includes('rel="icon"'))html=html.replace('</head>','<link rel="icon" href="icon.ico" type="image/x-icon"></head>');
if(!html.includes('id="wireframe"'))html=html.replace('<button id="fullscreen">','<button id="wireframe" aria-pressed="false" title="Afficher ou masquer les arêtes du modèle">Maillage</button><button id="fullscreen">');
html=html.replace(/<input id="model-file"[^>]*>/g,'');
html=html.replace(/data-bg="e3e0e9"/g,'data-bg="e8dcd2"').replace(/background:#e3e0e9/g,'background:#e8dcd2');
html=html.replace('aria-label="Fond sombre" aria-pressed="true"','aria-label="Fond sombre" aria-pressed="false"').replace('aria-label="Fond clair" aria-pressed="false"','aria-label="Fond clair" aria-pressed="true"');
html=html.replace(/<style id="studio-style">[\s\S]*?<\/style>/,'');
html=html.replace('</head>','<style id="studio-style">'+fs.readFileSync('studio.css','utf8')+'</style></head>');
fs.writeFileSync('viewer/index.html',html);
