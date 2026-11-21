"""The explicitly authorized Blender Base Color layer, identified by node UID."""

def _nodes(api, stack):
    pending=list(api.layerstack.get_root_layer_nodes(stack))
    while pending:
        node=pending.pop();yield node
        if hasattr(node,'sub_layers'): pending.extend(node.sub_layers())


def validate_owned(api, state, key_for):
    owned=state.setdefault('baseColorLayers',{})
    work=[]
    for material in api.textureset.all_texture_sets():
        for stack in material.all_stacks():
            if not stack.has_channel(api.textureset.ChannelType.BaseColor): continue
            key=key_for(material,stack)
            if key in owned:
                matches=[node for node in _nodes(api,stack) if node.uid()==owned[key]]
                if len(matches)!=1:
                    raise ValueError('Le calque Base Color Texture3D a été supprimé ou déplacé vers une autre pile. Aucun calque recréé automatiquement.')
            else: work.append((stack,key))
    return work


def ensure_base_color(api, state, identifier, key_for, persist):
    work=validate_owned(api,state,key_for)
    owned=state.setdefault('baseColorLayers',{})
    for stack,key in work:
        layer=api.layerstack.insert_fill(api.layerstack.InsertPosition.from_textureset_stack(stack))
        layer.set_name('Texture3D — Base Color')
        layer.active_channels={api.textureset.ChannelType.BaseColor}
        layer.set_source(api.textureset.ChannelType.BaseColor,identifier)
        owned[key]=layer.uid();persist()
