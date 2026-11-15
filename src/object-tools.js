import * as THREE from 'three';

// Viewer-only inspection: never writes into a texture or sends host commands.
export function createObjectTools({renderer, camera, controls, scene, enabled=true}) {
  const panel=document.createElement('section');panel.id='object-tools';
  panel.innerHTML=`<details open><summary>Objets <span id="object-count"></span></summary><div id="object-list"></div></details>
    <div class="object-actions"><button id="isolate-object" disabled>Isoler</button><button id="show-all-objects">Tout afficher</button></div>
    <button id="locate-uv" aria-pressed="false">Repérer UV</button><p id="object-status" role="status">Clique sur une pièce du modèle.</p>`;
  document.querySelector('.appearance-section').before(panel);panel.hidden=!enabled;
  const popup=document.createElement('section');popup.id='uv-inspector';popup.hidden=true;
  popup.innerHTML=`<header><strong>Repère UV</strong><button id="close-uv" aria-label="Fermer le repère UV">×</button></header>
    <div id="uv-surface"><canvas id="uv-preview" aria-label="Texture et point sélectionné"></canvas></div>
    <div class="uv-actions"><button id="uv-minus" aria-label="Dézoomer les UV">−</button><button id="uv-reset">Tout voir</button><button id="uv-focus">Cadrer la zone</button><button id="uv-plus" aria-label="Zoomer les UV">+</button></div>
    <p id="uv-status" role="status">Clique sur le modèle pour repérer une zone.</p>`;
  document.body.appendChild(popup);
  const list=panel.querySelector('#object-list'),status=panel.querySelector('#object-status');
  const isolate=panel.querySelector('#isolate-object'),locate=panel.querySelector('#locate-uv');
  const canvas=popup.querySelector('canvas'),surface=popup.querySelector('#uv-surface');
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let groups=[],root=null,selected=null,isolated=false,uvMode=false,hit=null,down=null,highlights=[];
  let zoom=1,pan={x:0,y:0},uvDrag=null;
  const dimensions=new Map();
  const visible=mesh=>{for(let o=mesh;o;o=o.parent)if(!o.visible)return false;return true;};
  function clearHighlights(){for(const line of highlights){line.removeFromParent();line.geometry.dispose();line.material.dispose();}highlights=[];}
  function highlight(){
    clearHighlights();
    if(!selected)return;
    for(const mesh of selected.meshes){
      const line=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,25),new THREE.LineBasicMaterial({color:0xa55770,transparent:true,opacity:.9,depthTest:true,depthWrite:false}));
      line.userData.texture3dSelection=true;line.renderOrder=2;mesh.add(line);highlights.push(line);
    }
  }
  function select(group){
    if(group!==selected){hit=null;zoom=1;pan={x:0,y:0};}
    selected=group;highlight();renderList();drawUV();
  }
  function renderList(){
    list.replaceChildren();panel.querySelector('#object-count').textContent=groups.length;
    for(const group of groups){
      const row=document.createElement('div');row.className='object-row';row.dataset.objectId=group.id;
      const eye=document.createElement('button');eye.className='object-eye';eye.textContent=group.meshes.some(visible)?'◉':'○';
      eye.setAttribute('aria-label',(group.meshes.some(visible)?'Masquer ':'Afficher ')+group.name);eye.setAttribute('aria-pressed',String(group.meshes.some(visible)));
      eye.onclick=()=>{const show=!group.meshes.some(visible);for(const mesh of group.meshes)mesh.visible=show;isolated=false;if(!show&&selected===group){hit=null;}renderList();drawUV();};
      const name=document.createElement('button');name.className='object-name';name.textContent=group.name;name.title=group.name;name.setAttribute('aria-pressed',String(selected===group));
      name.onclick=()=>select(group);row.append(eye,name);list.append(row);
    }
    isolate.disabled=!selected;isolate.setAttribute('aria-pressed',String(isolated));
    status.textContent=selected?selected.name+(isolated?' · isolé':''):'Clique sur une pièce du modèle.';
  }
  function fitSelected(){
    if(!selected)return;
    const box=new THREE.Box3();for(const mesh of selected.meshes){mesh.updateWorldMatrix(true,false);box.union(new THREE.Box3().setFromObject(mesh));}
    if(box.isEmpty())return;
    const target=box.getCenter(new THREE.Vector3()),radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.001);
    const angle=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
    const direction=camera.position.clone().sub(controls.target).normalize();
    controls.dispatchEvent({type:'start'});controls.enableDamping=false;controls.update();
    controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,radius/Math.sin(angle)*1.2);
    controls.minDistance=radius*.05;controls.maxDistance=Math.max(controls.maxDistance,radius*30);
    camera.near=Math.min(camera.near,radius/100);camera.updateProjectionMatrix();controls.update();controls.enableDamping=true;
  }
  isolate.onclick=()=>{if(!selected)return;for(const group of groups)for(const mesh of group.meshes)mesh.visible=group===selected;isolated=true;renderList();fitSelected();drawUV();};
  panel.querySelector('#show-all-objects').onclick=()=>{for(const group of groups)for(const mesh of group.meshes)mesh.visible=true;isolated=false;renderList();drawUV();};
  function setUVMode(value){uvMode=value;locate.setAttribute('aria-pressed',String(value));popup.hidden=!value;renderer.domElement.classList.toggle('uv-picking',value);drawUV();}
  locate.onclick=()=>setUVMode(!uvMode);popup.querySelector('#close-uv').onclick=()=>setUVMode(false);
  function pick(event){
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    scene.updateMatrixWorld(true);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
    const meshes=groups.flatMap(g=>g.meshes).filter(visible);
    const result=raycaster.intersectObjects(meshes,false)[0];
    if(!result){select(null);return;}
    select(groups.find(g=>g.meshes.includes(result.object)));
    hit=result;zoom=1;pan={x:0,y:0};drawUV();
  }
  renderer.domElement.addEventListener('pointerdown',e=>{if(enabled&&e.button===0)down={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};});
  renderer.domElement.addEventListener('pointermove',e=>{if(down&&down.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)down.moved=true;});
  renderer.domElement.addEventListener('pointerup',e=>{const gesture=down;down=null;if(gesture&&gesture.id===e.pointerId&&!gesture.moved)pick(e);});
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
  function textureUV(uv,map){const value=uv.clone();if(map){map.updateMatrix();map.transformUv(value);}else value.y=1-value.y;return value;}
  function drawUV(){
    if(popup.hidden)return;
    for(const key of ['u','v','pixelX','pixelY'])delete canvas.dataset[key];
    const w=surface.clientWidth||280,h=surface.clientHeight||280,dpr=Math.min(devicePixelRatio,2);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
    const mesh=hit?.object||selected?.meshes[0],material=Array.isArray(mesh?.material)?mesh.material[hit?.face?.materialIndex||0]:mesh?.material,map=material?.map,img=map?.image;
    const iw=img?.width||1,ih=img?.height||1,scale=Math.min(w/iw,h/ih)*zoom;
    const rw=iw*scale,rh=ih*scale,x=(w-rw)/2+pan.x,y=(h-rh)/2+pan.y;
    ctx.fillStyle='#fffaf5';ctx.fillRect(x,y,rw,rh);if(img)ctx.drawImage(img,x,y,rw,rh);
    // Draw geometry UVs independently of the Photoshop guide layer (excluded from paint).
    let triangleCount=0;
    ctx.save();ctx.beginPath();ctx.rect(x,y,rw,rh);ctx.clip();ctx.beginPath();
    for(const part of selected?.meshes||[]){
      const geometry=part.geometry,uvs=geometry.attributes.uv;if(!uvs)continue;
      const index=geometry.index,count=index?index.count:uvs.count;
      for(let i=0;i+2<count;i+=3){
        const slot=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex||0;
        const material=Array.isArray(part.material)?part.material[slot]:part.material;
        const partMap=material?.map;
        if(partMap!==map)continue;
        for(let k=0;k<3;k++){
          const point=textureUV(new THREE.Vector2().fromBufferAttribute(uvs,index?index.getX(i+k):i+k),partMap);
          if(k===0)ctx.moveTo(x+point.x*rw,y+point.y*rh);else ctx.lineTo(x+point.x*rw,y+point.y*rh);
        }
        ctx.closePath();triangleCount++;
      }
    }
    ctx.strokeStyle='#ffffffb0';ctx.lineWidth=2.5;ctx.stroke();ctx.strokeStyle='#292329';ctx.lineWidth=.85;ctx.stroke();ctx.restore();
    canvas.dataset.uvTriangles=String(triangleCount);
    const caption=popup.querySelector('#uv-status');
    if(!hit||!visible(hit.object)){caption.textContent=triangleCount?selected.name+' · UV de l’objet · clique sur le modèle pour placer un repère.':selected?'Aucune coordonnée UV disponible pour cet objet.':'Sélectionne un objet pour afficher ses UV.';return;}
    const attribute=hit.object.geometry.attributes.uv,face=hit.face;
    if(!hit.uv||!attribute||!face){caption.textContent='Cette face ne possède pas de coordonnées UV.';return;}
    const points=[face.a,face.b,face.c].map(i=>textureUV(new THREE.Vector2().fromBufferAttribute(attribute,i),map));
    ctx.beginPath();points.forEach((uv,i)=>{const px=x+uv.x*rw,py=y+uv.y*rh;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);});ctx.closePath();
    ctx.fillStyle='#a5577038';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#873d58';ctx.lineWidth=2;ctx.stroke();
    const uv=textureUV(hit.uv,map),px=x+uv.x*rw,py=y+uv.y*rh;
    ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fillStyle='#873d58';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.moveTo(px-12,py);ctx.lineTo(px+12,py);ctx.moveTo(px,py-12);ctx.lineTo(px,py+12);ctx.strokeStyle='#873d58';ctx.lineWidth=1;ctx.stroke();
    const size=dimensions.get(mesh.userData.textureSet)||dimensions.get('default')||{width:iw,height:ih};
    const pixelX=Math.min(size.width-1,Math.max(0,Math.floor(uv.x*size.width))),pixelY=Math.min(size.height-1,Math.max(0,Math.floor(uv.y*size.height)));
    caption.textContent=selected.name+' · '+(img?`X ${pixelX} · Y ${pixelY} px`:'Texture indisponible');
    canvas.dataset.u=String(uv.x);canvas.dataset.v=String(uv.y);canvas.dataset.pixelX=String(pixelX);canvas.dataset.pixelY=String(pixelY);
  }
  function focusUV(){
    if(!hit?.uv||!hit.face)return;
    const mesh=hit.object,map=Array.isArray(mesh.material)?mesh.material[hit.face.materialIndex]?.map:mesh.material?.map;
    const attribute=mesh.geometry.attributes.uv;if(!attribute)return;
    const points=[hit.face.a,hit.face.b,hit.face.c].map(i=>textureUV(new THREE.Vector2().fromBufferAttribute(attribute,i),map));
    const min=new THREE.Vector2(Infinity,Infinity),max=new THREE.Vector2(-Infinity,-Infinity);
    for(const uv of points){min.min(uv);max.max(uv);}
    const iw=map?.image?.width||1,ih=map?.image?.height||1;
    const w=surface.clientWidth,h=surface.clientHeight,scale=Math.min(w/iw,h/ih);
    zoom=THREE.MathUtils.clamp(Math.min(w/(Math.max(max.x-min.x,.001)*iw*scale),h/(Math.max(max.y-min.y,.001)*ih*scale))*.72,1,64);
    pan={x:(.5-(min.x+max.x)/2)*iw*scale*zoom,y:(.5-(min.y+max.y)/2)*ih*scale*zoom};
    drawUV();
  }
  popup.querySelector('#uv-focus').onclick=focusUV;
  function zoomBy(factor){
    zoom=THREE.MathUtils.clamp(zoom*factor,1,64);
    if(zoom===1)pan={x:0,y:0};
    else if(hit?.uv){const map=hit.object.material.map,img=map?.image,uv=textureUV(hit.uv,map);const w=img?.width||1,h=img?.height||1,scale=Math.min(surface.clientWidth/w,surface.clientHeight/h)*zoom;pan={x:(.5-uv.x)*w*scale,y:(.5-uv.y)*h*scale};}
    drawUV();
  }
  popup.querySelector('#uv-plus').onclick=()=>zoomBy(1.5);popup.querySelector('#uv-minus').onclick=()=>zoomBy(1/1.5);
  popup.querySelector('#uv-reset').onclick=()=>{zoom=1;pan={x:0,y:0};drawUV();};
  surface.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.15:1/1.15);},{passive:false});
  surface.addEventListener('pointerdown',e=>{if(e.button!==0)return;uvDrag={id:e.pointerId,x:e.clientX,y:e.clientY};surface.setPointerCapture(e.pointerId);});
  surface.addEventListener('pointermove',e=>{if(!uvDrag||uvDrag.id!==e.pointerId)return;pan.x+=e.clientX-uvDrag.x;pan.y+=e.clientY-uvDrag.y;uvDrag.x=e.clientX;uvDrag.y=e.clientY;drawUV();});
  const end=e=>{if(uvDrag?.id===e.pointerId)uvDrag=null;};surface.addEventListener('pointerup',end);surface.addEventListener('pointercancel',end);surface.addEventListener('lostpointercapture',end);
  const header=popup.querySelector('header');let windowDrag=null;
  header.style.cursor='move';header.style.touchAction='none';
  header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;const r=popup.getBoundingClientRect();windowDrag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};header.setPointerCapture(e.pointerId);});
  header.addEventListener('pointermove',e=>{if(windowDrag?.id!==e.pointerId)return;popup.style.right='auto';popup.style.left=Math.max(0,Math.min(innerWidth-popup.offsetWidth,e.clientX-windowDrag.x))+'px';popup.style.top=Math.max(0,Math.min(innerHeight-popup.offsetHeight,e.clientY-windowDrag.y))+'px';});
  header.addEventListener('pointerup',()=>{windowDrag=null;});header.addEventListener('pointercancel',()=>{windowDrag=null;});
  new ResizeObserver(drawUV).observe(surface);
  return {
    clear(){clearHighlights();groups=[];root=null;selected=null;hit=null;down=null;isolated=false;dimensions.clear();renderList();drawUV();},
    setModel(model){
      this.clear();root=model;if(!enabled)return;
      const grouped=new Map();
      root.traverse(mesh=>{if(!mesh.isMesh)return;let owner=mesh;while(owner!==root&&!owner.userData.texture3d_source_id&&owner.parent)owner=owner.parent;
        const id=owner.userData.texture3d_source_id||mesh.uuid;
        if(!grouped.has(id))grouped.set(id,{id,name:owner.userData.texture3d_source_name||mesh.name||'Objet '+(grouped.size+1),meshes:[]});grouped.get(id).meshes.push(mesh);
      });groups=[...grouped.values()];renderList();
    },
    textureChanged(message){dimensions.set(message.setID||'default',{width:message.width,height:message.height});drawUV();},
  };
}
