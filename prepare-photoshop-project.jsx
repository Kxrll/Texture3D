#target photoshop
(function () {
    var project = __PROJECT_JSON__;
    var destination = new File(project.psd);
    function showLayers(layers) {
        for (var j = 0; j < layers.length; j++) {
            layers[j].visible = true;
            if (layers[j].typename === 'LayerSet') showLayers(layers[j].layers);
        }
    }
    for (var i = 0; i < app.documents.length; i++) {
        try {
            if (app.documents[i].fullName.fsName === destination.fsName) {
                app.activeDocument = app.documents[i]; showLayers(app.activeDocument.layers); return destination.fsName;
            }
        } catch (_) {}
    }
    if (destination.exists) { var opened = app.open(destination); showLayers(opened.layers); return destination.fsName; }
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
        var guideColor = new SolidColor(); guideColor.rgb.hexValue = '23DCEC';
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
    var options = new PhotoshopSaveOptions(); options.layers = true; options.embedColorProfile = true;
    doc.saveAs(destination, options, false, Extension.LOWERCASE);
    return destination.fsName;
}());
