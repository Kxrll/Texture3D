import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import cubeData from './cube-data.js';

const tell = message => { if(window.uxpHost)window.uxpHost.postMessage(message); };
const externalToken=new URLSearchParams(location.hash.slice(1)).get('token');
if(window.uxpHost || !externalToken)document.body.classList.add('embedded');
function fail(error){document.getElementById('error').textContent=error.message; tell({type:'error',message:error.message});}
try {
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(parseInt(document.querySelector('[data-bg][aria-pressed="true"]')?.dataset.bg||'e8dcd2',16));
  document.querySelectorAll('[data-bg]').forEach(button=>button.addEventListener('click',()=>{
    renderer.setClearColor(parseInt(button.dataset.bg,16));
    document.querySelectorAll('[data-bg]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  }));
  const viewport=document.getElementById('viewport');
  viewport.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,0.01,1000);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.dampingFactor=0.075;
  controls.rotateSpeed=0.65;controls.panSpeed=0.65;controls.zoomSpeed=0.65;
  let cameraTransition=null,zoomGoal=null,lastTick=performance.now();
  function transitionTo(position,target){
    controls.enableDamping=false;controls.update();controls.enableDamping=true;
    const offset=camera.position.clone().sub(controls.target),end=position.clone().sub(target);
    cameraTransition={start:performance.now(),target:controls.target.clone(),endTarget:target.clone(),direction:offset.clone().normalize(),rotation:new THREE.Quaternion().setFromUnitVectors(offset.clone().normalize(),end.clone().normalize()),distance:offset.length(),endDistance:end.length()};zoomGoal=null;
  }
  controls.addEventListener('start',()=>{cameraTransition=null;zoomGoal=null;});
  renderer.domElement.addEventListener('wheel',event=>{
    event.preventDefault();event.stopImmediatePropagation();cameraTransition=null;
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
    const distance=zoomGoal===null?camera.position.distanceTo(controls.target):zoomGoal;
    zoomGoal=THREE.MathUtils.clamp(distance*Math.exp(THREE.MathUtils.clamp(delta,-150,150)*0.0018),controls.minDistance,controls.maxDistance);
  },{capture:true,passive:false});
  const loader=new GLTFLoader();
  let model=null,texture=null,latestSeq=0,modelSeq=0;
  const setTextures=new Map(),setSequences=new Map();
  let wireframeEnabled=false;
  function updateWireframe(){
    if(!model)return;
    const meshes=[];
    model.traverse(object=>{if(object.isMesh)meshes.push(object);});
    for(const mesh of meshes){
      let overlay=mesh.children.find(child=>child.userData.texture3dWireframe);
      if(!overlay&&wireframeEnabled){
        overlay=new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x99566f,transparent:true,opacity:0.65,depthTest:true,depthWrite:false}));
        overlay.userData.texture3dWireframe=true;
        overlay.renderOrder=1;
        mesh.add(overlay);
      }
      if(overlay)overlay.visible=wireframeEnabled;
      for(const material of [].concat(mesh.material)){
        material.polygonOffset=wireframeEnabled;
        material.polygonOffsetFactor=1;
        material.polygonOffsetUnits=1;
        material.needsUpdate=true;
      }
    }
  }
  const wireframeButton=document.getElementById('wireframe');
  wireframeButton.addEventListener('click',()=>{
    wireframeEnabled=!wireframeEnabled;
    wireframeButton.setAttribute('aria-pressed',String(wireframeEnabled));
    updateWireframe();
  });
  const textureCanvas=document.createElement('canvas');
  function frame(animate=false){
    if(!model)return;
    const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3());
    const radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,0.001);
    const halfVertical=THREE.MathUtils.degToRad(camera.fov/2);
    const halfHorizontal=Math.atan(Math.tan(halfVertical)*camera.aspect);
    const distance=radius/Math.sin(Math.min(halfVertical,halfHorizontal))*1.2;
    const position=center.clone().add(new THREE.Vector3(1,0.7,1).normalize().multiplyScalar(distance));
    if(animate)transitionTo(position,center);else{cameraTransition=null;zoomGoal=null;controls.target.copy(center);camera.position.copy(position);}
    camera.near=radius/100;camera.far=radius*100;camera.updateProjectionMatrix();
    controls.minDistance=radius*0.15;controls.maxDistance=radius*30;controls.update();
  }
  function disposeModel(root){root.traverse(o=>{if(o.userData.texture3dWireframe){o.geometry.dispose();o.material.dispose();}else if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material)){for(const value of Object.values(m)){if(value && value.isTexture && value!==texture&&!Array.from(setTextures.values()).includes(value))value.dispose();}m.dispose();}}});}
  function loadModel(buffer){
    const request=++modelSeq;
    loader.parse(buffer,'',gltf=>{
      if(request!==modelSeq){disposeModel(gltf.scene);return;}
      const candidate=gltf.scene;let meshes=0;
      let missingUV=false;
      candidate.traverse(o=>{if(o.isMesh){meshes++;if(!o.geometry.attributes.uv)missingUV=true;}});
      if(missingUV){disposeModel(candidate);fail(new Error('Le modèle ne contient pas de coordonnées UV.'));return;}
      if(!meshes){fail(new Error('Aucun maillage dans ce GLB.'));return;}
      if(model){scene.remove(model);disposeModel(model);}
      model=candidate;
      model.traverse(o=>{if(o.isMesh){const old=[].concat(o.material)[0];o.userData.textureSet=old.userData.texture3d_set||(old.name.startsWith('Texture3D_set_')?old.name.slice('Texture3D_'.length):null);const map=o.userData.textureSet?setTextures.get(o.userData.textureSet):texture;const color=old.color?.clone()||new THREE.Color(0xc9cbd0);for(const m of [].concat(o.material))m.dispose();o.material=new THREE.MeshBasicMaterial({map:map||null,color:map?0xffffff:color,side:THREE.DoubleSide});}});
      updateWireframe();scene.add(model);frame();document.getElementById('error').textContent='';tell({type:'ready'});
    },fail);
  }
  async function applyTexture(m){
    if(m.setID){
      const key=m.setID;setSequences.set(key,m);const img=new Image();img.src=m.url;await img.decode();if(setSequences.get(key)!==m)return;
      let map=setTextures.get(key);if(map&&map.userData.source===m.url)return;
      const canvas=document.createElement('canvas');const scale=Math.min(1,renderer.capabilities.maxTextureSize/Math.max(m.width,m.height));canvas.width=Math.round(m.width*scale);canvas.height=Math.round(m.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const next=new THREE.CanvasTexture(canvas);next.flipY=false;next.colorSpace=THREE.SRGBColorSpace;next.userData.source=m.url;setTextures.set(key,next);texture=next;
      if(model)model.traverse(o=>{if(o.isMesh&&o.userData.textureSet===key){o.material.map=next;o.material.color.set(0xffffff);o.material.needsUpdate=true;}});if(map)map.dispose();return;
    }
    latestSeq=m.seq;
    const img=new Image();img.src=m.url;
    await img.decode();
    if(m.seq!==latestSeq)return;
    const scale=Math.min(1,renderer.capabilities.maxTextureSize/Math.max(m.width,m.height),8192/Math.max(m.width,m.height));
    textureCanvas.width=Math.max(1,Math.round(m.width*scale));
    textureCanvas.height=Math.max(1,Math.round(m.height*scale));
    const ctx=textureCanvas.getContext('2d');ctx.clearRect(0,0,textureCanvas.width,textureCanvas.height);
    const b=m.bounds;ctx.drawImage(img,b.left*scale,b.top*scale,(b.right-b.left)*scale,(b.bottom-b.top)*scale);
    if(!texture){texture=new THREE.CanvasTexture(textureCanvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
    texture.needsUpdate=true;
    if(model)model.traverse(o=>{if(o.isMesh){o.material.map=texture;o.material.color.set(0xffffff);o.material.needsUpdate=true;}});
    tell({type:'applied',seq:m.seq});
  }
  window.addEventListener('message',event=>{
    if(window.uxpHost && event.source!==window.uxpHost)return;
    const m=event.data;if(!m)return;
    try{if(m.type==='texture')applyTexture(m).catch(fail);if(m.type==='reset')frame();if(m.type==='model')loadModel(new Uint8Array(m.bytes).buffer);}catch(e){fail(e);}
  });
  function resize(){const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);renderer.setSize(w,h);const aspect=w/h;if(model){const offset=camera.position.clone().sub(controls.target);offset.multiplyScalar(Math.min(1,camera.aspect)/Math.min(1,aspect));camera.position.copy(controls.target).add(offset);}camera.aspect=aspect;camera.updateProjectionMatrix();}
  addEventListener('resize',resize);resize();
  new ResizeObserver(resize).observe(viewport);
  if(innerWidth<900 && !window.uxpHost)document.body.classList.add('sidebar-hidden');
  const toggle=document.getElementById('toggle');
  const updateToggle=()=>{toggle.setAttribute('aria-label',document.body.classList.contains('sidebar-hidden')?'Afficher les commandes':'Masquer les commandes');toggle.setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')));};updateToggle();resize();
  toggle.addEventListener('click',()=>{document.body.classList.toggle('sidebar-hidden');updateToggle();resize();});
  const panHandle=document.createElement('button');
  panHandle.id='pan-view';panHandle.title='Glisser pour déplacer la vue';panHandle.setAttribute('aria-label','Déplacer la vue');
  panHandle.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6c0 4-2 7-6 7h-1c-2 0-3-1-4-3l-4-5a1.5 1.5 0 0 1 2-2l1 1"/></svg>';
  document.body.appendChild(panHandle);
  let panDrag=null;
  panHandle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    cameraTransition=null;zoomGoal=null;controls.enableDamping=false;controls.update();controls.enabled=false;
    panDrag={id:event.pointerId,x:event.clientX,y:event.clientY};panHandle.setPointerCapture(event.pointerId);event.preventDefault();
  });
  panHandle.addEventListener('pointermove',event=>{
    if(!panDrag||event.pointerId!==panDrag.id)return;
    const scale=2*camera.position.distanceTo(controls.target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,viewport.clientHeight);
    const offset=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0).multiplyScalar(-(event.clientX-panDrag.x)*scale);
    offset.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix,1),(event.clientY-panDrag.y)*scale);
    camera.position.add(offset);controls.target.add(offset);controls.update();panDrag.x=event.clientX;panDrag.y=event.clientY;
  });
  function endPan(event){if(!panDrag||event.pointerId!==panDrag.id)return;panDrag=null;if(panHandle.hasPointerCapture(event.pointerId))panHandle.releasePointerCapture(event.pointerId);controls.enabled=true;controls.enableDamping=true;}
  panHandle.addEventListener('pointerup',endPan);panHandle.addEventListener('pointercancel',endPan);panHandle.addEventListener('lostpointercapture',endPan);
  const gizmo=document.getElementById('gizmo');
  let gizmoDrag=null,suppressAxisClick=false;
  gizmo.style.touchAction='none';
  gizmo.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    cameraTransition=null;zoomGoal=null;
    controls.enableDamping=false;controls.update();controls.enabled=false;
    gizmoDrag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,capture:event.target};
    suppressAxisClick=false;gizmoDrag.capture.setPointerCapture(event.pointerId);event.preventDefault();
  });
  gizmo.addEventListener('pointermove',event=>{
    const drag=gizmoDrag;if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    drag.x=event.clientX;drag.y=event.clientY;
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>3)drag.moved=true;
    if(!drag.moved)return;
    const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    spherical.theta-=dx*0.012;spherical.phi-=dy*0.012;spherical.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    camera.lookAt(controls.target);controls.update();
  });
  function endGizmo(event){
    if(!gizmoDrag||gizmoDrag.id!==event.pointerId)return;
    suppressAxisClick=gizmoDrag.moved;const capture=gizmoDrag.capture;gizmoDrag=null;
    if(capture.hasPointerCapture(event.pointerId))capture.releasePointerCapture(event.pointerId);
    controls.enabled=true;controls.enableDamping=true;
  }
  gizmo.addEventListener('pointerup',endGizmo);gizmo.addEventListener('pointercancel',endGizmo);gizmo.addEventListener('lostpointercapture',endGizmo);
  const axes=[['X',1,0,0,'Droite'],['Y',0,1,0,'Dessus'],['Z',0,0,1,'Face'],['−X',-1,0,0,'Gauche'],['−Y',0,-1,0,'Dessous'],['−Z',0,0,-1,'Dos']].map(([label,x,y,z,title],index)=>{
    const button=document.createElement('button');button.textContent=label;button.title=title;button.setAttribute('aria-label','Vue '+title.toLowerCase());button.className='axis axis-'+(index%3)+(index>2?' negative':'');gizmo.appendChild(button);
    const axis=new THREE.Vector3(x,y,z);
    button.addEventListener('click',()=>{
      if(suppressAxisClick){suppressAxisClick=false;return;}
      cameraTransition=null;zoomGoal=null;
      controls.enableDamping=false;controls.update();
      camera.position.copy(controls.target.clone().addScaledVector(axis,camera.position.distanceTo(controls.target)));
      camera.lookAt(controls.target);controls.update();controls.enableDamping=true;
    });
    return {axis,button,index};
  });
  const inverse=new THREE.Quaternion(),projected=new THREE.Vector3();
  function drawGizmo(){
    inverse.copy(camera.quaternion).invert();
    for(const a of axes){projected.copy(a.axis).applyQuaternion(inverse);a.button.style.left=(56+projected.x*37)+'px';a.button.style.top=(56-projected.y*37)+'px';a.button.style.zIndex=String(Math.round((projected.z+1)*10));a.button.style.opacity=projected.z<-.1?'0.48':'1';
      if(a.index<3){const line=document.getElementById('axis-line-'+a.index);line.setAttribute('x2',56+projected.x*37);line.setAttribute('y2',56-projected.y*37);}
    }
  }
  renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-lastTick)/1000,0.05);lastTick=now;
    if(cameraTransition){const a=cameraTransition,t=Math.min(1,(now-a.start)/420),smooth=t*t*(3-2*t);controls.target.copy(a.target).lerp(a.endTarget,smooth);const direction=a.direction.clone().applyQuaternion(new THREE.Quaternion().identity().slerp(a.rotation,smooth));camera.position.copy(controls.target).addScaledVector(direction,THREE.MathUtils.lerp(a.distance,a.endDistance,smooth));if(t===1)cameraTransition=null;}
    else if(zoomGoal!==null){const offset=camera.position.clone().sub(controls.target),distance=offset.length(),next=THREE.MathUtils.lerp(distance,zoomGoal,1-Math.exp(-14*dt));camera.position.copy(controls.target).add(offset.setLength(next));if(Math.abs(next-zoomGoal)<zoomGoal*0.0005)zoomGoal=null;}
    controls.update(dt);renderer.render(scene,camera);drawGizmo();
  });
  const bytes=Uint8Array.from(atob(cubeData),c=>c.charCodeAt(0));loadModel(bytes.buffer);
  document.getElementById('frame').addEventListener('click',()=>frame(true));
  renderer.domElement.addEventListener('dblclick',()=>frame(true));
  document.getElementById('help').addEventListener('click',()=>{const hint=document.getElementById('hint');hint.hidden=!hint.hidden;document.getElementById('help').setAttribute('aria-expanded',String(!hint.hidden));});
  document.getElementById('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){fail(new Error('Utilise F11 pour le plein écran.'));}
  });
  document.addEventListener('fullscreenchange',()=>{document.getElementById('fullscreen').textContent=document.fullscreenElement?'Quitter le plein écran':'Plein écran';resize();});
  if(externalToken && !window.uxpHost){
    let revision=-1,lastModelVersion=-1,lastTextureVersion=-1,serverInstance=null,activeProject=null;
    const connection=document.getElementById('connection');
    let lastTextureUpdate=0,viewerConnected=true;
    function updateAge(){
      if(!lastTextureUpdate||!viewerConnected)return;
      const seconds=Math.max(0,Math.floor((Date.now()-lastTextureUpdate)/1000));
      const age=seconds<60?seconds+' s':seconds<3600?Math.floor(seconds/60)+' min':Math.floor(seconds/3600)+' h';
      connection.textContent='Texture à jour · il y a '+age;
    }
    setInterval(updateAge,1000);
    let exporting=false;
    document.getElementById('blender').addEventListener('click',async()=>{
      if(exporting)return;
      exporting=true;const button=document.getElementById('blender'),message=document.getElementById('export-status');button.disabled=true;
      try{
        message.textContent='Actualisation de la texture…';
        const auth={'X-Texture3D-Key':externalToken};
        const initial=await (await fetch('/revision',{headers:auth})).json();
        const response=await fetch('/command',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({type:'refresh'})});
        if(!response.ok)throw Error('Ouvre le plugin Photoshop et associe ton document avant l’envoi.');
        const refreshCommand=await response.json();
        let snapshot=null;
        const deadline=Date.now()+60000;
        while(Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,300));
          const state=await (await fetch('/revision',{headers:auth})).json();
          if(state.textureVersion>initial.textureVersion){snapshot=await (await fetch('/state',{headers:auth})).json();if(snapshot.texture&&(!refreshCommand.id||snapshot.texture.refreshRequest===refreshCommand.id))break;snapshot=null;}
        }
        if(!snapshot)throw Error('La texture n’a pas été actualisée. Vérifie le document associé dans Photoshop.');
        await applyTexture({...snapshot.texture,seq:snapshot.textureVersion});
        if(!model||!texture)throw Error('Charge un modèle et une texture avant l’envoi.');
        message.textContent='Envoi du PNG original dans Blender…';
        const result=await fetch('/return-blender',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({projectID:snapshot.projectID,textureVersion:snapshot.textureVersion,setID:snapshot.texture?.setID})});
        const data=await result.json();if(!result.ok)throw Error(data.error||'Échec de l’export.');
        message.textContent=data.count+' objet(s) mis à jour dans la scène Blender ouverte.';
      }catch(e){message.textContent=e.message;}
      finally{exporting=false;button.disabled=false;}
    });
    let commandBusy=false;
    const materialSelect=document.getElementById('texture-set');
    materialSelect.addEventListener('change',()=>command({type:'link',documentName:materialSelect.value}));
    const commandButtons=['associate','refresh-external','auto-external'].map(id=>document.getElementById(id));
    async function command(message){
      if(commandBusy)return;
      commandBusy=true;
      try{
        const response=await fetch('/command',{method:'POST',headers:{'Content-Type':'application/json','X-Texture3D-Key':externalToken},body:JSON.stringify(message)});
        if(!response.ok)throw new Error(response.status===503?'Ouvre le plugin dans Photoshop pour rétablir la liaison.':'Commande refusée ('+response.status+').');
        document.getElementById('bridge-status').textContent='Commande envoyée à Photoshop…';
      }catch(e){document.getElementById('bridge-status').textContent=e.message;}
      finally{commandBusy=false;}
    }
    document.getElementById('associate').addEventListener('click',()=>command({type:'link'}));
    document.getElementById('refresh-external').addEventListener('click',()=>command({type:'refresh'}));
    document.getElementById('auto-external').addEventListener('change',event=>command({type:'auto',enabled:event.target.checked}));
    async function poll(){
      try{
        const infoResponse=await fetch('/info',{headers:{'X-Texture3D-Key':externalToken},cache:'no-store'});
        if(!infoResponse.ok)throw Error('Connexion refusée');
        const info=await infoResponse.json();
        if(info.instanceID&&info.instanceID!==serverInstance){serverInstance=info.instanceID;revision=-1;lastModelVersion=-1;lastTextureVersion=-1;}
        if(!exporting)document.getElementById('blender').disabled=!info.blenderOnline;
        document.getElementById('host-state').textContent=info.online?'Photoshop connecté':'Photoshop déconnecté';
        document.getElementById('host-state').classList.toggle('online',info.online);
        commandButtons.forEach(button=>button.disabled=!info.online);
        document.getElementById('document-name').textContent=(info.document||'Aucun document associé').replace(/^Texture : /,'');
        const sets=info.textureSets||[];document.getElementById('texture-set-row').hidden=sets.length<2;
        const signature=JSON.stringify(sets.map(s=>[s.document,s.name]));if(materialSelect.dataset.signature!==signature){materialSelect.replaceChildren(...sets.map(s=>{const option=document.createElement('option');option.value=s.document;option.textContent=s.name;return option;}));materialSelect.dataset.signature=signature;}materialSelect.value=info.activeDocument||'';materialSelect.disabled=!info.online;document.getElementById('associate').hidden=!!sets.length;document.querySelector('#associate + .caption').hidden=!!sets.length;document.querySelector('#associate + .caption').textContent=sets.length?'Choisis un matériau pour ouvrir son document dans Photoshop.':'Pour changer de texture, associe le document ouvert dans Photoshop.';document.querySelector('.export-section .caption').textContent=sets.length?'Ta peinture, sur les objets de la scène ouverte.':'Ta peinture, sur les objets de la scène ouverte.';
        document.getElementById('auto-external').checked=info.auto;
        document.getElementById('bridge-status').textContent=info.online?((/^(À jour|Texture à jour)/.test(info.status)?'Synchronisation active · Ctrl + S':info.status)+(info.blenderOnline?'':' · Blender déconnecté : ouvre la scène et reprends la peinture.')):'Photoshop déconnecté. Rouvre Photoshop ou utilise Reprendre la peinture dans Blender.';
        const response=await fetch('/state?after='+revision,{headers:{'X-Texture3D-Key':externalToken},cache:'no-store'});
        if(response.status===200){
          const state=await response.json();
          if(activeProject!==state.projectID){activeProject=state.projectID;setSequences.clear();for(const map of setTextures.values())map.dispose();setTextures.clear();}
          if(state.modelVersion!==lastModelVersion){
            document.getElementById('model-name').textContent=state.model?.name||'Cube.glb';
            loadModel(state.model?new Uint8Array(state.model.bytes).buffer:Uint8Array.from(atob(cubeData),c=>c.charCodeAt(0)).buffer);
            lastModelVersion=state.modelVersion;
          }
          if(state.texture && state.textureVersion!==lastTextureVersion){await applyTexture({...state.texture,seq:state.textureVersion});lastTextureVersion=state.textureVersion;lastTextureUpdate=state.texture.updatedAt||Date.now();}
          for(const entry of Object.values(state.textures||{}))await applyTexture(entry);
          revision=state.revision;
          viewerConnected=true;if(lastTextureUpdate)updateAge();else connection.textContent='En attente de la texture Photoshop…';
        }else if(response.status!==204)throw Error('Connexion refusée');
        viewerConnected=true;
      }catch(e){viewerConnected=false;connection.textContent='Déconnecté — relance OUVRIR_VIEWER.vbs';}
      setTimeout(poll,500);
    }
    poll();
  }
}catch(error){fail(error);}
