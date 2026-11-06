#target photoshop
(function () {
    var source = app.activeDocument;
    if (source.name !== 'CUBE_UV_2048.png') throw new Error('Le patron UV doit être le document actif.');
    var output = new File('C:/Users/karl pedrocchi/Desktop/projet photoshop/CUBE_texture_test.psd');
    if (output.exists) throw new Error('Le PSD de test existe déjà.');
    var doc = source.duplicate('CUBE_texture_test');
    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
        var uv = doc.activeLayer;
        uv.name = 'Repère UV';
        var paint = doc.artLayers.add();
        paint.name = 'Peinture';
        paint.move(uv, ElementPlacement.PLACEAFTER);
        doc.activeLayer = paint;
        function fillRect(x, y, w, h, hex) {
            var color = new SolidColor(); color.rgb.hexValue = hex;
            doc.selection.select([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
            doc.selection.fill(color, ColorBlendMode.NORMAL, 100, false);
            doc.selection.deselect();
        }
        fillRect(0,0,2048,2048,'F5F2EB');
        fillRect(0,0,512,512,'FFBF47');
        fillRect(0,512,512,512,'7755CC');
        fillRect(0,1024,512,512,'29B5A5');
        fillRect(0,1536,512,512,'3B82F6');
        fillRect(512,1024,512,512,'EF6C53');
        fillRect(512,1536,512,512,'83B84A');
        uv.allLocked = true;
        uv.visible = false;
        doc.activeLayer = paint;
        var options = new PhotoshopSaveOptions();
        options.layers = true;
        options.embedColorProfile = true;
        doc.saveAs(output, options, false, Extension.LOWERCASE);
        return doc.fullName.fsName;
    } finally { app.preferences.rulerUnits = oldUnits; }
}());
