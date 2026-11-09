#target photoshop
(function () {
    var project = __PROJECT_JSON__;
    var destination = new File(project.psd);
    function improvePainterGuide(doc) {
        if (!project.painter) return;
        var group = doc.layerSets.getByName('Repère UV');
        var backgroundName = 'Fond de travail (non exporté)';
        try { group.artLayers.getByName(backgroundName); return; } catch (_) {}
        var active = doc.activeLayer;
        var selection = null;
        try { doc.selection.bounds; selection = doc.channels.add(); doc.selection.store(selection); } catch (_) {}
        group.allLocked = false;
        try {
            var background = group.artLayers.add();
            background.name = backgroundName;
            background.move(group, ElementPlacement.PLACEATEND);
            doc.activeLayer = background;
            var white = new SolidColor(); white.rgb.hexValue = 'FFFFFF';
            doc.selection.selectAll(); doc.selection.fill(white); doc.selection.deselect();
            // Strengthen older antialiased guides as well as newly generated ones.
            var outline = group.artLayers.getByName('Tracé UV');
            outline.allLocked = false;
            for (var k = 0; k < 2; k++) { var copy = outline.duplicate(); outline = copy.merge(); }
            outline.name = 'Tracé UV';
            group.visible = true;
        } finally {
            if (selection) { doc.selection.load(selection); selection.remove(); }
            group.allLocked = true;
            doc.activeLayer = active;
        }
    }
    function showLayers(layers) {
        for (var j = 0; j < layers.length; j++) {
            layers[j].visible = true;
            if (layers[j].typename === 'LayerSet') showLayers(layers[j].layers);
        }
    }
    for (var i = 0; i < app.documents.length; i++) {
        try {
            if (app.documents[i].fullName.fsName === destination.fsName) {
                app.activeDocument = app.documents[i]; if (!project.painter) showLayers(app.activeDocument.layers); improvePainterGuide(app.activeDocument); return destination.fsName;
            }
        } catch (_) {}
    }
    if (destination.exists) { var opened = app.open(destination); if (!project.painter) showLayers(opened.layers); improvePainterGuide(opened); return destination.fsName; }
    if (project.resume) throw new Error('Le PSD du projet est introuvable. Utilise Retrouver le PSD dans Blender.');
    var source = app.open(new File(project.texture));
    var doc = source.duplicate(destination.name.replace(/\.psd$/i, ''));
    source.close(SaveOptions.DONOTSAVECHANGES);
    doc.activeLayer.name = 'Couleur de base';
    var guide = app.open(new File(project.uv));
    guide.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    guide.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    var uv = doc.layers[0]; uv.name = 'Tracé UV'; uv.visible = true;
    var guideGroup = doc.layerSets.add(); guideGroup.name = 'Repère UV';
    uv.move(guideGroup, ElementPlacement.INSIDE);
    if (project.regions) {
        var guideColor = new SolidColor(); guideColor.rgb.hexValue = '202020';
        var w = doc.width.as('px'), h = doc.height.as('px');
        for (var objectName in project.regions) {
            var regions = project.regions[objectName];
            for (var regionIndex = 0; regionIndex < regions.length; regionIndex++) {
                var region = regions[regionIndex];
                var label = guideGroup.artLayers.add(); label.kind = LayerKind.TEXT;
                label.name = objectName + ' · ' + region.material;
                label.textItem.contents = label.name.substring(0, 60);
                label.textItem.color = guideColor;
                label.textItem.size = Math.max(10, Math.min(28, w * region.scale / 35));
                label.textItem.position = [UnitValue(region.x * w + 8, 'px'), UnitValue((1 - region.y - region.scale) * h + 28, 'px')];
            }
        }
    }
    guideGroup.visible = true; guideGroup.allLocked = true;
    var paint = doc.artLayers.add(); paint.name = 'Peinture';
    paint.move(guideGroup, ElementPlacement.PLACEBEFORE);
    doc.activeLayer = paint;
    improvePainterGuide(doc);
    var options = new PhotoshopSaveOptions(); options.layers = true; options.embedColorProfile = true;
    doc.saveAs(destination, options, false, Extension.LOWERCASE);
    return destination.fsName;
}());
