import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const $ = id => document.getElementById(id);
const canvas = $('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
} catch (error) {
  $('intro').classList.add('hidden');
  $('fatal').hidden = false;
  $('fatalMessage').textContent = 'WebGLで3D画面を作成できませんでした。ChromeまたはEdgeのハードウェアアクセラレーションとWebGLを有効にして再読み込みしてください。';
  throw error;
}
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9bd4d8');
scene.fog = new THREE.Fog('#b9e5da',48,145);
const camera = new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.015,500);
const hemi = new THREE.HemisphereLight(0xe5f8ff,0x688d74,2.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d1,2.8);
sun.position.set(-30,65,28);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-48;sun.shadow.camera.right=48;
sun.shadow.camera.top=48;sun.shadow.camera.bottom=-48;
sun.shadow.bias=-.0005;scene.add(sun);
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(5,18,12),new THREE.MeshBasicMaterial({color:0xfff1b5,fog:false}));
sunDisc.position.set(-82,70,-105);scene.add(sunDisc);
const world = new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0),allowSleep:true});
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations=10;
world.defaultContactMaterial.friction=.55;
world.defaultContactMaterial.restitution=.06;
const groundBody = new CANNON.Body({mass:0,shape:new CANNON.Plane()});
groundBody.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(groundBody);

const ground = new THREE.Mesh(new THREE.BoxGeometry(220,2,220),new THREE.MeshStandardMaterial({color:0xb7d6ba,roughness:.94}));
ground.position.y=-1.001;ground.receiveShadow=true;scene.add(ground);
const grid = new THREE.GridHelper(220,220,0x91bda9,0x9ac3ad);grid.position.y=.008;
grid.material.transparent=true;grid.material.opacity=.32;scene.add(grid);
const raySurface = new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
raySurface.rotation.x=-Math.PI/2;raySurface.position.y=.015;raySurface.userData.isGround=true;scene.add(raySurface);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const cube = new THREE.BoxGeometry(1,1,1);
const mats = {
 marble:{color:0xe9f1f2,roughness:.55},
 stone:{color:0x6f8695,roughness:.84},
 wood:{color:0xc89c71,roughness:.8},
 mint:{color:0x70edc1,roughness:.5},
 pink:{color:0xfca3b9,roughness:.53},
 glass:{color:0x80dce9,roughness:.2,metalness:.18,transparent:true,opacity:.77},
 metal:{color:0x8696ad,roughness:.26,metalness:.65},
 gold:{color:0xf3c875,roughness:.31,metalness:.48}
};
const threeMats = Object.fromEntries(Object.entries(mats).map(([k,v])=>[k,new THREE.MeshStandardMaterial(v)]));
let blockId=1,miniId=1,mobId=1;
const blocks=[], mobs=[], strokes=[],portals=[null,null],miniInventory=[],history=[];
let currentMiniGroup='mini-'+(miniId++),activeTool='build',placingPrefab=-1;
let selectedBlock=null,heldBlock=null,penDrawing=null,nextPortal=0;
let toastTimer=null,lastSaveAt=0,lastStamp=0,portalParticles=[];
const keys=new Set();
const player = {position:new THREE.Vector3(0,0,11),scale:1,yVel:0,onGround:true,yaw:0,pitch:.29,portalTime:0};
const avatar=new THREE.Group();scene.add(avatar);
function basicBox(parent,dim,pos,color,metalness=0){
  const mesh=new THREE.Mesh(cube,new THREE.MeshStandardMaterial({color,roughness:.68,metalness}));
  mesh.scale.set(...dim);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
basicBox(avatar,[.53,.75,.32],[0,.9,0],0x274259);
basicBox(avatar,[.56,.43,.44],[0,1.57,0],0xefe3d2);
basicBox(avatar,[.57,.15,.48],[0,1.85,0],0x233948);
basicBox(avatar,[.12,.2,.12],[-.36,.98,0],0x9fdccd);
basicBox(avatar,[.12,.2,.12],[.36,.98,0],0x9fdccd);
basicBox(avatar,[.16,.47,.2],[-.16,.34,0],0x233b50);
basicBox(avatar,[.16,.47,.2],[.16,.34,0],0x233b50);
basicBox(avatar,[.06,.06,.02],[-.12,1.61,-.23],0x223c55);
basicBox(avatar,[.06,.06,.02],[.12,1.61,-.23],0x223c55);
function setPlayerScale(scale,quiet=false){
  player.scale=THREE.MathUtils.clamp(Math.round(scale*100)/100,.1,3);
  avatar.scale.setScalar(player.scale);
  player.position.y=Math.max(player.position.y,0);
  updateStats();
  if(!quiet)notify('プレイヤーサイズ：'+player.scale.toFixed(2)+'×'+(player.scale===.1?'（通常の1/10）':''));
}
function notify(message){
  const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2500);
}
function status(message){$('statusText').textContent=message;}
function updateStats(){
  $('statObjects').textContent=blocks.length+' BLOCKS';
  $('statScale').textContent=player.scale.toFixed(2)+'×';
}
function makeBlock(pos,size=1,material='marble',dynamic=false,groupId=null,record=false){
  size=THREE.MathUtils.clamp(Number(size)||1,.08,8);
  if(blocks.length>1800){notify('ブロック数上限（1800個）です');return null;}
  const mesh=new THREE.Mesh(cube,threeMats[material]||threeMats.marble);
  mesh.position.set(pos.x,pos.y,pos.z);mesh.scale.setScalar(size);
  mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.userData.block=true;
  scene.add(mesh);
  const body=new CANNON.Body({mass:dynamic?Math.max(.04,size*size*size):0,shape:new CANNON.Box(new CANNON.Vec3(size/2,size/2,size/2)),material:new CANNON.Material({friction:.6,restitution:.08})});
  body.position.set(pos.x,pos.y,pos.z);
  body.allowSleep=true;body.sleepSpeedLimit=.05;body.sleepTimeLimit=1.5;
  world.addBody(body);
  const block={id:blockId++,mesh,body,size,material,dynamic,groupId,portalTime:0};
  mesh.userData.blockId=block.id;blocks.push(block);
  if(record)history.push({type:'add',id:block.id});
  updateStats();return block;
}
function packBlock(b){
  return {x:+b.body.position.x.toFixed(4),y:+b.body.position.y.toFixed(4),z:+b.body.position.z.toFixed(4),size:b.size,material:b.material,dynamic:b.dynamic,groupId:b.groupId,quaternion:[b.body.quaternion.x,b.body.quaternion.y,b.body.quaternion.z,b.body.quaternion.w]};
}
function removeBlock(block){
  if(!block)return;
  scene.remove(block.mesh);world.removeBody(block.body);
  const i=blocks.indexOf(block);if(i!==-1)blocks.splice(i,1);
  if(selectedBlock===block){selectedBlock=null;$('selectedName').textContent='未選択';}
  if(heldBlock===block)heldBlock=null;
  updateStats();
}
function findBlock(id){return blocks.find(b=>b.id===id);}
function setDynamic(block,enabled){
  if(!block||block.dynamic===enabled)return;
  const pos=block.body.position.clone(),q=block.body.quaternion.clone();
  world.removeBody(block.body);
  const body=new CANNON.Body({mass:enabled?Math.max(.04,block.size**3):0,shape:new CANNON.Box(new CANNON.Vec3(block.size/2,block.size/2,block.size/2))});
  body.position.copy(pos);body.quaternion.copy(q);
  body.allowSleep=true;world.addBody(body);block.body=body;block.dynamic=enabled;
  notify(enabled?'物理演算を有効にしました':'ブロックを固定しました');
}
const preview=new THREE.Mesh(cube,new THREE.MeshBasicMaterial({color:0xb5fce4,transparent:true,opacity:.32,depthWrite:false}));
preview.visible=false;scene.add(preview);
function addScenery(){
  const spireMat=new THREE.MeshStandardMaterial({color:0xe6f2e7,roughness:.7});
  function scenicBox(x,y,z,w,h,d,material){
    const m=new THREE.Mesh(cube,material||spireMat);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);
  }
  // Decorative geometric trees and distant block cliffs outside the building area.
  const trunk=new THREE.MeshStandardMaterial({color:0x748677});
  const foliage=[new THREE.MeshStandardMaterial({color:0x85bd9f}),new THREE.MeshStandardMaterial({color:0x78b49a}),new THREE.MeshStandardMaterial({color:0x9bcea5})];
  for(let i=0;i<48;i++){
    const t=i/48*Math.PI*2;const r=27+(i*17%19);
    const x=Math.cos(t)*r,z=Math.sin(t)*r;
    scenicBox(x,1.5,z,.56,3,.56,trunk);
    scenicBox(x,4.1,z,2.3+(i%3)*.4,2.5,2.3+(i%3)*.4,foliage[i%3]);
  }
  const platform=new THREE.Mesh(new THREE.BoxGeometry(18,.3,18),new THREE.MeshStandardMaterial({color:0xd4e9df,roughness:.7}));
  platform.position.set(0,-.17,0);platform.receiveShadow=true;scene.add(platform);
  const rim=new THREE.Mesh(new THREE.BoxGeometry(18.6,.16,18.6),new THREE.MeshStandardMaterial({color:0x5cbba1,roughness:.35,metalness:.3}));
  rim.position.set(0,-.4,0);scene.add(rim);
  for(let i=0;i<13;i++){
    const a=i/13*Math.PI*2;
    const x=Math.cos(a)*73,z=Math.sin(a)*73;
    scenicBox(x,5+(i%5)*2,z,5,10+(i%5)*4,5,new THREE.MeshStandardMaterial({color:i%2?0xadc9ba:0x8cb9b0,roughness:.85}));
  }
  for(let i=0;i<7;i++){
    const x=-40+i*14,z=-68+(i%2)*7;
    scenicBox(x,30+i%3*4,z,9,2,5,new THREE.MeshStandardMaterial({color:0xe6f6ed,roughness:1}));
  }
}
addScenery();

function spawnMob(pos={x:1,y:0,z:5},scale=1,kind=null){
  if(mobs.length>=45){notify('モブは45体までです');return null;}
  scale=THREE.MathUtils.clamp(Number(scale)||1,.1,3);
  kind=kind||['cat','robot','friend'][mobId%3];
  const group=new THREE.Group(),id=mobId++;
  if(kind==='cat'){
    basicBox(group,[.7,.46,.94],[0,.52,0],0xf8c98c);
    basicBox(group,[.63,.63,.59],[0,.83,-.35],0xffdcb1);
    basicBox(group,[.19,.2,.2],[-.2,1.22,-.48],0xf8c98c);
    basicBox(group,[.19,.2,.2],[.2,1.22,-.48],0xf8c98c);
    basicBox(group,[.09,.085,.025],[-.15,.89,-.66],0x324655);
    basicBox(group,[.09,.085,.025],[.15,.89,-.66],0x324655);
    basicBox(group,[.15,.14,.52],[0,.67,.6],0xf8c98c);
  }else if(kind==='robot'){
    basicBox(group,[.55,.74,.43],[0,.64,0],0xacc7d9);
    basicBox(group,[.62,.54,.52],[0,1.2,0],0xe4ecf0);
    basicBox(group,[.36,.1,.05],[0,1.22,-.28],0x4ef1de,.2);
    basicBox(group,[.16,.08,.16],[0,1.55,0],0x55ffd6,.3);
    basicBox(group,[.15,.5,.16],[-.4,.65,0],0x8caab9);
    basicBox(group,[.15,.5,.16],[.4,.65,0],0x8caab9);
    basicBox(group,[.18,.35,.18],[-.17,.16,0],0x8caab9);
    basicBox(group,[.18,.35,.18],[.17,.16,0],0x8caab9);
  }else{
    basicBox(group,[.52,.6,.35],[0,.76,0],0xf3aebe);
    basicBox(group,[.5,.45,.45],[0,1.35,0],0xf2d5b5);
    basicBox(group,[.54,.18,.5],[0,1.63,0],0x586777);
    basicBox(group,[.13,.4,.16],[-.33,.78,0],0xf2d5b5);
    basicBox(group,[.13,.4,.16],[.33,.78,0],0xf2d5b5);
    basicBox(group,[.16,.36,.17],[-.15,.25,0],0x637d91);
    basicBox(group,[.16,.36,.17],[.15,.25,0],0x637d91);
  }
  group.scale.setScalar(scale);scene.add(group);
  for(const child of group.children)child.userData.mobId=id;
  const body = new CANNON.Body({mass:1,shape:new CANNON.Sphere(.42*scale),linearDamping:.72,angularDamping:1});
  body.position.set(pos.x,(pos.y||0)+.43*scale,pos.z);body.fixedRotation=true;body.updateMassProperties();
  world.addBody(body);
  const mob={id,kind,group,body,scale,phase:Math.random()*7,wander:Math.random()*10,portalTime:0};
  mobs.push(mob);return mob;
}
function removeMobs(){
  for(const m of mobs){scene.remove(m.group);world.removeBody(m.body);}
  mobs.length=0;
}
function sizeMob(mob,scale){
  if(!mob)return;scale=THREE.MathUtils.clamp(Number(scale)||1,.1,3);
  const footY=mob.body.position.y-.42*mob.scale;
  mob.scale=scale;mob.group.scale.setScalar(scale);
  mob.body.removeShape(mob.body.shapes[0]);
  mob.body.addShape(new CANNON.Sphere(.42*scale));
  mob.body.mass=Math.max(.05,scale**3);mob.body.updateMassProperties();mob.body.updateBoundingRadius();mob.body.aabbNeedsUpdate=true;
  mob.body.position.y=Math.max(.42*scale,footY+.42*scale);mob.body.wakeUp();
  notify((mob.kind==='cat'?'ネコ':mob.kind==='robot'?'ロボット':'住民')+'を'+scale.toFixed(2)+'×に変更！');
}
function seedWorld(){
  for(const b of [...blocks])removeBlock(b);
  removeMobs();clearPortals(true);clearStrokes();
  miniInventory.length=0;currentMiniGroup='mini-'+(miniId++);placingPrefab=-1;
  player.position.set(0,0,12);player.yVel=0;player.yaw=0;player.pitch=.3;setPlayerScale(1,true);
  // A chunky stack and an elevated build sample.
  const sample=[
    [7,.5,-2,1,'stone'],[8,.5,-2,1,'stone'],[9,.5,-2,1,'stone'],
    [7,1.5,-2,1,'mint'],[8,1.5,-2,1,'marble'],[9,1.5,-2,1,'mint'],
    [7,2.5,-2,1,'marble'],[9,2.5,-2,1,'marble'],[8,2.5,-2,1,'glass'],
    [7,3.5,-2,1,'gold'],[8,3.5,-2,1,'gold'],[9,3.5,-2,1,'gold'],
    [-9,.5,-5,1,'wood'],[-8,.5,-5,1,'wood'],[-7,.5,-5,1,'wood'],
    [-9,1.5,-5,1,'wood'],[-7,1.5,-5,1,'wood'],[-8,1.5,-5,1,'glass'],
    [-9,2.5,-5,1,'pink'],[-8,2.5,-5,1,'pink'],[-7,2.5,-5,1,'pink']
  ];
  for(const [x,y,z,s,m] of sample)makeBlock({x,y,z},s,m);
  // Tiny example house, collectible as one item at normal size.
  const g='mini-example';
  for(let x=0;x<7;x++)for(let z=0;z<6;z++)makeBlock({x:-2.6+x*.1,y:.05,z:-2.8+z*.1},.1,'wood',false,g);
  for(let y=1;y<=7;y++)for(let x=0;x<7;x++)for(let z=0;z<6;z++){
    const edge=x===0||x===6||z===0||z===5;
    if(!edge)continue;
    if(z===0&&(x===3||x===4)&&y<5)continue;
    if((x===0||x===6)&&z===2&&y>=3&&y<=5)continue;
    makeBlock({x:-2.6+x*.1,y:.05+y*.1,z:-2.8+z*.1},.1,y>5?'pink':'marble',false,g);
  }
  for(let x=-1;x<=7;x++)for(let z=-1;z<=6;z++){
    makeBlock({x:-2.6+x*.1,y:.85+(Math.abs(x-3)*.035),z:-2.8+z*.1},.1,'pink',false,g);
  }
  spawnMob({x:2,y:0,z:1},1,'cat');spawnMob({x:-3,y:0,z:4},1,'robot');
  spawnMob({x:3,y:0,z:-5},1,'friend');
  updateMiniStatus();refreshInventory();history.length=0;updateStats();
}
function updateMiniStatus(){
  const num=blocks.filter(b=>b.groupId===currentMiniGroup).length;
  $('miniGroupStatus').textContent='現在のミニ建築：'+num+'ブロック（1/10サイズで設置）';
}
function refreshInventory(){
  const el=$('miniPrefabSelect');
  el.replaceChildren();
  const empty=document.createElement('option');empty.value='-1';empty.textContent='通常ブロックを設置';el.appendChild(empty);
  miniInventory.forEach((item,i)=>{
    const op=document.createElement('option');op.value=String(i);op.textContent='▦ '+item.name+' ('+item.parts.length+'ピース)';el.appendChild(op);
  });
  if(placingPrefab>=miniInventory.length)placingPrefab=-1;
  el.value=String(placingPrefab);
  $('inventoryHint').textContent=miniInventory.length
    ?'コレクション：'+miniInventory.length+'個。選択してクリックすると1個まるごと設置できます。'
    :'通常サイズでミニ建築を Shift + クリックして、1アイテムとして回収できます。';
}
function packMiniature(block){
  if(!block.groupId||player.scale<.95)return false;
  const parts=blocks.filter(b=>b.groupId===block.groupId);
  if(!parts.length)return false;
  if(parts.length>800){notify('この建築は大きすぎます（800個まで）');return false;}
  const minX=Math.min(...parts.map(p=>p.body.position.x));
  const minZ=Math.min(...parts.map(p=>p.body.position.z));
  const footY=Math.min(...parts.map(p=>p.body.position.y-p.size/2));
  const pack={name:'ミニ建築 '+String(miniInventory.length+1).padStart(2,'0'),parts:parts.map(p=>({x:+(p.body.position.x-minX).toFixed(4),y:+(p.body.position.y-footY).toFixed(4),z:+(p.body.position.z-minZ).toFixed(4),size:p.size,material:p.material,dynamic:false}))};
  parts.forEach(removeBlock);miniInventory.push(pack);
  if(block.groupId===currentMiniGroup)currentMiniGroup='mini-'+(miniId++);
  refreshInventory();updateMiniStatus();notify('ミニチュア建築を1ブロックとして回収しました！');
  return true;
}
function placeMiniature(point){
  const pack=miniInventory[placingPrefab];
  if(!pack)return;
  if(blocks.length+pack.parts.length>1800){notify('ブロック数上限のため配置できません');return;}
  const group='placed-mini-'+(miniId++);
  const x=Math.round(point.x*10)/10,z=Math.round(point.z*10)/10;
  const y=Math.max(0,point.y);
  for(const p of pack.parts)makeBlock({x:x+p.x,y:y+p.y,z:z+p.z},p.size,p.material,false,group);
  miniInventory.splice(placingPrefab,1);placingPrefab=-1;
  refreshInventory();updateMiniStatus();notify('ミニ建築を1アイテムから展開しました');
}
function createStroke(points,color,width=0.05,saveToArray=true){
  if(!Array.isArray(points)||points.length<2)return null;
  const pts=points.map(p=>new THREE.Vector3(p.x,p.y,p.z));
  const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');
  const geometry=new THREE.TubeGeometry(curve,Math.min(600,Math.max(3,pts.length*3)),width,5,false);
  const material=new THREE.MeshBasicMaterial({color});
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  const stroke={mesh,color,width,points:pts.map(p=>({x:p.x,y:p.y,z:p.z}))};
  if(saveToArray)strokes.push(stroke);
  return stroke;
}
function clearStrokes(){
  strokes.forEach(s=>{scene.remove(s.mesh);s.mesh.geometry.dispose();s.mesh.material.dispose();});
  strokes.length=0;
}
function createPortal(index,point,normal){
  const existing=portals[index];if(existing){scene.remove(existing.group);}
  const n=normal.clone().normalize();
  // Ground hits create an upright portal that faces the player.
  if(n.y>.8){n.set(Math.sin(player.yaw),0,Math.cos(player.yaw));}
  const loc=point.clone();
  if(normal.y>.8)loc.y+=1.24;
  loc.addScaledVector(n,.065);
  const group=new THREE.Group();group.position.copy(loc);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);
  const color=index===0?0x63d6ff:0xffb765;
  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.06,.095,12,72),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.96}));
  rim.scale.set(.79,1.22,1);group.add(rim);
  const shell=new THREE.Mesh(new THREE.CircleGeometry(.98,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}));
  shell.scale.set(.8,1.25,1);group.add(shell);
  const inner=new THREE.Mesh(new THREE.TorusGeometry(.9,.015,6,64),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.42}));
  inner.scale.set(.8,1.25,1);group.add(inner);
  const halo=new THREE.PointLight(color,2.3,6,2);group.add(halo);
  scene.add(group);portals[index]={group,point:loc,normal:n,index};
  nextPortal=1-index;notify('ポータル '+(index===0?'A':'B')+' を設置');
}
function clearPortals(quiet=false){
  for(let i=0;i<2;i++){if(portals[i])scene.remove(portals[i].group);portals[i]=null;}
  nextPortal=0;if(!quiet)notify('ポータルを消去しました');
}

function setTool(name){
  if(!['build','pen','physics','mini','portal'].includes(name))return;
  activeTool=name;selectedBlock=null;heldBlock=null;
  $('selectedName').textContent='未選択';
  document.querySelectorAll('.tool').forEach(el=>el.classList.toggle('active',el.dataset.tool===name));
  document.querySelectorAll('.tool-panel').forEach(el=>el.classList.toggle('active',el.dataset.panel===name));
  $('toolCounter').textContent=String(['build','pen','physics','mini','portal'].indexOf(name)+1).padStart(2,'0')+' / 05';
  status(name.toUpperCase()+' TOOL READY');
  preview.visible=false;
}
function getHit(event,withMobs=true){
  if(document.pointerLockElement===canvas||!event){
    pointer.set(0,0);
  }else{
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height*2-1));
  }
  raycaster.setFromCamera(pointer,camera);
  const objects=blocks.map(b=>b.mesh);
  objects.push(raySurface);
  if(withMobs)for(const m of mobs)objects.push(...m.group.children);
  const intersections=raycaster.intersectObjects(objects,false);
  return intersections.find(hit=>hit.distance<65)||null;
}
function hitNormal(hit){
  if(!hit)return new THREE.Vector3(0,1,0);
  if(hit.object.userData.isGround)return new THREE.Vector3(0,1,0);
  if(hit.face)return hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  return new THREE.Vector3(0,1,0);
}
function blockPlacement(hit,size){
  const n=hitNormal(hit);
  const p=hit.point.clone().addScaledVector(n,size*.53);
  const snap=v=>Math.round(v/size)*size;
  const y=Math.max(size/2,Math.round((p.y-size/2)/size)*size+size/2);
  return new THREE.Vector3(snap(p.x),y,snap(p.z));
}
function setPenGeometry(){
  if(!penDrawing||penDrawing.points.length<2)return;
  const line=penDrawing.line;
  if(line)scene.remove(line);
  if(line){line.geometry.dispose();line.material.dispose();}
  const g=new THREE.BufferGeometry().setFromPoints(penDrawing.points);
  const lineMesh=new THREE.Line(g,new THREE.LineBasicMaterial({color:penDrawing.color}));
  penDrawing.line=lineMesh;scene.add(lineMesh);
}
function addPenPoint(event){
  if(!penDrawing)return;
  const hit=getHit(event,false);if(!hit)return;
  const p=hit.point.clone().addScaledVector(hitNormal(hit),.026);
  const last=penDrawing.points[penDrawing.points.length-1];
  if(last&&p.distanceTo(last)<.028)return;
  if(penDrawing.points.length>=500)return;
  penDrawing.points.push(p);setPenGeometry();
}
function finishPen(){
  if(!penDrawing)return;
  if(penDrawing.line){
    scene.remove(penDrawing.line);
    penDrawing.line.geometry.dispose();penDrawing.line.material.dispose();
  }
  if(penDrawing.points.length>=2){
    const s=createStroke(penDrawing.points,penDrawing.color,penDrawing.width);
    history.push({type:'stroke',stroke:s});
    notify('ペンで描画しました');
  }
  penDrawing=null;
}
function clicked(event){
  if($('intro').classList.contains('hidden')===false||event.button!==0)return;
  event.preventDefault();
  const hit=getHit(event);
  if(!hit)return;
  const block=hit.object.userData.block?findBlock(hit.object.userData.blockId):null;
  const mob=mobs.find(m=>m.id===hit.object.userData.mobId);
  if(activeTool==='build'){
    if(event.shiftKey){
      if(!block)return;
      if(packMiniature(block))return;
      const data=packBlock(block);
      removeBlock(block);history.push({type:'delete',data});
      notify('ブロックを削除しました');return;
    }
    if(placingPrefab>=0){
      placeMiniature(hit.point);return;
    }
    const size=Number($('blockSize').value)||.25;
    const p=blockPlacement(hit,size);
    const group=player.scale<=.105?currentMiniGroup:null;
    const b=makeBlock(p,size,$('material').value,$('dynamicBlock').checked,group,true);
    if(group&&b)updateMiniStatus();
  }else if(activeTool==='physics'){
    selectedBlock=block||null;
    $('selectedName').textContent=block?block.material.toUpperCase()+' / '+block.size.toFixed(2):'未選択';
    notify(block?'ブロックを選択しました':'ブロックを狙ってください');
  }else if(activeTool==='mini'){
    if(mob)sizeMob(mob,Number($('sizeSlider').value));
    else notify('モブに照準を合わせてクリック');
  }else if(activeTool==='portal'){
    createPortal(nextPortal,hit.point,hitNormal(hit));
  }else if(activeTool==='pen'){
    penDrawing={points:[],line:null,color:$('inkColor').value,width:Number($('penWidth').value)};
    addPenPoint(event);
  }
  if(document.pointerLockElement!==canvas&&canvas.requestPointerLock)canvas.requestPointerLock().catch(()=>{});
}
canvas.addEventListener('mousedown',clicked);
canvas.addEventListener('mousemove',event=>{
  if(document.pointerLockElement===canvas){
    player.yaw-=event.movementX*.0025;
    player.pitch=THREE.MathUtils.clamp(player.pitch+event.movementY*.0018,-.17,1.1);
  }
  if(penDrawing&&activeTool==='pen')addPenPoint(event);
});
window.addEventListener('mouseup',()=>finishPen());
canvas.addEventListener('contextmenu',event=>event.preventDefault());
function doUndo(){
  const item=history.pop();if(!item){notify('これ以上戻せません');return;}
  if(item.type==='add')removeBlock(findBlock(item.id));
  if(item.type==='delete'){
    const d=item.data;makeBlock(d,d.size,d.material,d.dynamic,d.groupId);
  }
  if(item.type==='stroke'&&item.stroke){
    const i=strokes.indexOf(item.stroke);
    if(i!==-1){strokes.splice(i,1);scene.remove(item.stroke.mesh);item.stroke.mesh.geometry.dispose();item.stroke.mesh.material.dispose();}
  }
  updateMiniStatus();notify('操作を1つ戻しました');
}
function shootBall(){
  if(balls.length>90){notify('物理ボール上限です');return;}
  const forward=new THREE.Vector3(-Math.sin(player.yaw),Math.sin(player.pitch)*.25,-Math.cos(player.yaw)).normalize();
  const radius=.28,mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,14,10),new THREE.MeshStandardMaterial({color:Math.random()>.5?0xf7a6c3:0x9ff4df,metalness:.24,roughness:.33}));
  mesh.castShadow=true;mesh.receiveShadow=true;
  const origin=player.position.clone().add(new THREE.Vector3(0,player.scale*1.4+.5,0)).addScaledVector(forward,1.4*player.scale+1);
  mesh.position.copy(origin);scene.add(mesh);
  const body=new CANNON.Body({mass:.35,shape:new CANNON.Sphere(radius),linearDamping:.012});
  body.position.set(origin.x,origin.y,origin.z);
  body.velocity.set(forward.x*19,forward.y*19+4,forward.z*19);
  world.addBody(body);balls.push({mesh,body,created:performance.now(),portalTime:0});
}
const balls=[];
function removeBall(ball){
  scene.remove(ball.mesh);ball.mesh.geometry.dispose();ball.mesh.material.dispose();world.removeBody(ball.body);
  const i=balls.indexOf(ball);if(i>=0)balls.splice(i,1);
}
function handleKeyDown(event){
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  if(event.repeat&&['KeyQ','KeyE','KeyF','KeyZ'].includes(event.code))return;
  keys.add(event.code);
  if(/^Digit[1-5]$/.test(event.code))setTool(['build','pen','physics','mini','portal'][Number(event.code.slice(-1))-1]);
  if(event.code==='KeyQ')shootBall();
  if(event.code==='KeyZ'&&(event.ctrlKey||event.metaKey||!event.shiftKey))doUndo();
  if(event.code==='KeyF'&&selectedBlock&&selectedBlock.dynamic){
    const d=new CANNON.Vec3(-Math.sin(player.yaw),.35,-Math.cos(player.yaw));
    selectedBlock.body.applyImpulse(d.scale(Math.max(3,selectedBlock.body.mass*15)),selectedBlock.body.position);
    notify('ブロックを押し飛ばしました');
  }
  if(event.code==='KeyE'&&activeTool==='physics'){
    if(heldBlock){heldBlock=null;notify('ブロックを放しました');}
    else if(selectedBlock){
      if(!selectedBlock.dynamic)setDynamic(selectedBlock,true);
      heldBlock=selectedBlock;notify('ブロックをつかみました。Eで放す');
    }
  }
}
window.addEventListener('keydown',handleKeyDown);
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
document.querySelectorAll('.tool').forEach(btn=>btn.addEventListener('click',()=>setTool(btn.dataset.tool)));
$('helpBtn').addEventListener('click',()=>notify('WASD移動 / SPACEジャンプ / 1～5ツール / Qボール / Eつかむ / Shift+クリック回収'));
$('spawnMobBtn').addEventListener('click',()=>{
  const pos=player.position.clone().add(new THREE.Vector3(-Math.sin(player.yaw)*3,0,-Math.cos(player.yaw)*3));
  const mob=spawnMob({x:pos.x,y:0,z:pos.z},1);
  if(mob)notify('フレンドリーモブを追加しました');
});
$('spawnBallBtn').addEventListener('click',shootBall);
$('makeDynamicBtn').addEventListener('click',()=>selectedBlock?setDynamic(selectedBlock,true):notify('まず物体を選択してください'));
$('freezeBtn').addEventListener('click',()=>selectedBlock?setDynamic(selectedBlock,!selectedBlock.dynamic):notify('まず物体を選択してください'));
$('sizeSlider').addEventListener('input',e=>$('scaleValue').innerHTML=Number(e.target.value).toFixed(2)+'<small>×</small>');
$('applySelfBtn').addEventListener('click',()=>setPlayerScale(Number($('sizeSlider').value)));
$('makeTenthBtn').addEventListener('click',()=>{setPlayerScale(.1);$('sizeSlider').value='.1';$('scaleValue').innerHTML='0.10<small>×</small>';});
$('resetSelfBtn').addEventListener('click',()=>{setPlayerScale(1);$('sizeSlider').value='1';$('scaleValue').innerHTML='1.00<small>×</small>';});
$('newMiniGroupBtn').addEventListener('click',()=>{currentMiniGroup='mini-'+(miniId++);updateMiniStatus();notify('新しいミニ建築を開始しました');});
$('miniPrefabSelect').addEventListener('change',event=>{placingPrefab=Number(event.target.value);if(placingPrefab>=0)notify('ミニ建築を設置する場所をクリック');});
$('penWidth').addEventListener('input',e=>$('penWidthLabel').textContent=Number(e.target.value).toFixed(3));
$('clearPortalsBtn').addEventListener('click',()=>clearPortals());
$('undoBtn').addEventListener('click',doUndo);
$('playBtn').addEventListener('click',()=>{
  $('intro').classList.add('hidden');canvas.requestPointerLock?.().catch(()=>{});
  notify('ワールドへようこそ！まずはツール1～5を試してみよう');
});
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
});

const SAVE_VERSION=1,SAVE_PREFIX='pens-world-slot-';
function snapshot(){
  return {
    format:'pens-physics-playground',version:SAVE_VERSION,savedAt:new Date().toISOString(),
    blocks:blocks.map(packBlock),
    strokes:strokes.map(s=>({points:s.points,color:s.color,width:s.width})),
    mobs:mobs.map(m=>({kind:m.kind,scale:m.scale,x:m.body.position.x,y:Math.max(0,m.body.position.y-.42*m.scale),z:m.body.position.z})),
    portals:portals.map(p=>p?({point:p.point.toArray(),normal:p.normal.toArray()}):null),
    player:{position:player.position.toArray(),scale:player.scale,yaw:player.yaw},
    miniInventory:miniInventory.map(t=>({name:t.name,parts:t.parts})),
    currentMiniGroup
  };
}
function saveWorld(quiet=false){
  try{
    const slot=$('saveSlot').value;
    localStorage.setItem(SAVE_PREFIX+slot,JSON.stringify(snapshot()));
    lastSaveAt=performance.now();
    if(!quiet)notify('スロット '+slot+' に保存しました');
  }catch(error){if(!quiet)notify('保存できませんでした：容量またはブラウザ設定を確認');}
}
function validatePoint(p){
  return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)
    &&Math.abs(p.x)<200&&Math.abs(p.y)<150&&Math.abs(p.z)<200;
}
function restoreWorld(data){
  if(!data||data.format!=='pens-physics-playground'||data.version!==1)throw new Error('Pensのセーブデータではありません');
  if(!Array.isArray(data.blocks)||data.blocks.length>1800)throw new Error('ブロック数が不正です');
  if(!Array.isArray(data.mobs)||data.mobs.length>45)throw new Error('モブ数が不正です');
  if(!Array.isArray(data.strokes)||data.strokes.length>400)throw new Error('ペンデータ数が不正です');
  // Do not modify the scene until the main format and array limits are validated.
  for(const b of [...blocks])removeBlock(b);
  removeMobs();clearStrokes();clearPortals(true);
  for(const ball of [...balls])removeBall(ball);
  miniInventory.length=0;history.length=0;heldBlock=null;selectedBlock=null;
  for(const d of data.blocks){
    if(!validatePoint(d)||!Number.isFinite(d.size)||d.size<.08||d.size>8)continue;
    const b=makeBlock(d,d.size,typeof d.material==='string'?d.material:'marble',Boolean(d.dynamic),typeof d.groupId==='string'?d.groupId:null);
    if(b&&Array.isArray(d.quaternion)&&d.quaternion.length===4&&d.quaternion.every(Number.isFinite)){
      b.body.quaternion.set(...d.quaternion);b.mesh.quaternion.set(...d.quaternion);
    }
  }
  for(const s of data.strokes){
    if(!Array.isArray(s.points)||s.points.length<2||s.points.length>500)continue;
    if(!s.points.every(validatePoint))continue;
    const color=/^#[0-9a-fA-F]{6}$/.test(s.color)?s.color:'#fc6f96';
    createStroke(s.points,color,THREE.MathUtils.clamp(Number(s.width)||.05,.015,.18));
  }
  for(const m of data.mobs){
    if(!validatePoint(m))continue;
    spawnMob({x:m.x,y:m.y,z:m.z},m.scale,['cat','robot','friend'].includes(m.kind)?m.kind:'cat');
  }
  if(Array.isArray(data.portals)){
    for(let i=0;i<2;i++){
      const item=data.portals[i];
      if(!item||!Array.isArray(item.point)||!Array.isArray(item.normal))continue;
      if(item.point.length!==3||item.normal.length!==3)continue;
      if(![...item.point,...item.normal].every(Number.isFinite))continue;
      const p=new THREE.Vector3(...item.point),n=new THREE.Vector3(...item.normal);
      if(n.length()<.01||p.length()>200)continue;
      createPortal(i,p.clone().addScaledVector(n,-.065),n);
    }
  }
  if(data.player&&Array.isArray(data.player.position)&&data.player.position.length===3&&data.player.position.every(Number.isFinite)){
    const p=new THREE.Vector3(...data.player.position);
    if(p.length()<190)player.position.copy(p);
    setPlayerScale(Number(data.player.scale)||1,true);
    player.yaw=Number(data.player.yaw)||0;player.yVel=0;
  }
  if(Array.isArray(data.miniInventory)){
    for(const pkg of data.miniInventory.slice(0,100)){
      if(!pkg||!Array.isArray(pkg.parts)||pkg.parts.length>800)continue;
      const validParts=pkg.parts.filter(p=>validatePoint(p)&&Number.isFinite(p.size)&&p.size>=.08&&p.size<=8);
      if(validParts.length)miniInventory.push({name:typeof pkg.name==='string'?pkg.name.slice(0,50):'ミニ建築',parts:validParts});
    }
  }
  currentMiniGroup=typeof data.currentMiniGroup==='string'?data.currentMiniGroup:'mini-'+(miniId++);
  placingPrefab=-1;refreshInventory();updateMiniStatus();updateStats();
}
function loadWorld(){
  const slot=$('saveSlot').value;
  try{
    const data=localStorage.getItem(SAVE_PREFIX+slot);
    if(!data){notify('スロット '+slot+' にセーブデータはありません');return;}
    restoreWorld(JSON.parse(data));notify('スロット '+slot+' をロードしました');
  }catch(error){notify('ロードに失敗：'+String(error.message||error).slice(0,65));}
}
function exportWorld(){
  const data=JSON.stringify(snapshot(),null,2);
  const blob=new Blob([data],{type:'application/json'});
  const href=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=href;anchor.download='Pens-world-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(href),5000);
  notify('ワールドのJSONを書き出しました');
}
$('saveBtn').addEventListener('click',()=>saveWorld());
$('loadBtn').addEventListener('click',loadWorld);
$('exportBtn').addEventListener('click',exportWorld);
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>5000000){notify('5MB以下のセーブデータを選んでください');return;}
  try{restoreWorld(JSON.parse(await file.text()));notify('ファイルからロードしました。保存ボタンで確定できます');}
  catch(error){notify('読み込みエラー：'+String(error.message||error).slice(0,70));}
  event.target.value='';
});
$('resetBtn').addEventListener('click',()=>{
  if(!confirm('ワールドを初期状態に戻しますか？保存済みスロットはそのまま残ります。'))return;
  seedWorld();notify('ワールドを初期化しました');
});
let playerMotion=new THREE.Vector3(),walkTime=0;
function updatePlayer(dt){
  const forward=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));
  const f=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
  const r=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  const movement=forward.multiplyScalar(f).add(right.multiplyScalar(r));
  if(movement.length()>1)movement.normalize();
  const speed=6*(.18+.82*Math.sqrt(player.scale));
  playerMotion.copy(movement).multiplyScalar(speed);
  const previousY=player.position.y;
  player.position.x=THREE.MathUtils.clamp(player.position.x+playerMotion.x*dt,-108,108);
  player.position.z=THREE.MathUtils.clamp(player.position.z+playerMotion.z*dt,-108,108);
  if(player.onGround&&(keys.has('Space'))){
    player.yVel=5.7*Math.sqrt(player.scale);player.onGround=false;
  }
  player.yVel-=9.82*dt;
  player.position.y+=player.yVel*dt;
  let floor=0;
  for(const b of blocks){
    const top=b.body.position.y+b.size/2;
    if(top>floor&&top<=previousY+Math.max(.18,player.scale*.23)&&
      Math.abs(player.position.x-b.body.position.x)<b.size/2+player.scale*.19 &&
      Math.abs(player.position.z-b.body.position.z)<b.size/2+player.scale*.19)floor=top;
  }
  if(player.position.y<=floor&&player.yVel<=0){
    player.position.y=floor;player.yVel=0;player.onGround=true;
  }else player.onGround=false;
  avatar.position.copy(player.position);avatar.rotation.y=player.yaw;
  walkTime+=(movement.length()>.1?dt*10:dt*1.5);
  avatar.children[5].rotation.x=movement.length()>.1?Math.sin(walkTime)*.33:0;
  avatar.children[6].rotation.x=movement.length()>.1?-Math.sin(walkTime)*.33:0;
  // Third-person zoom follows the avatar's actual size, including 1/10 scale.
  const dist=Math.max(1.35,player.scale*5.1);
  const lookHeight=player.scale*1.12;
  const target=player.position.clone().add(new THREE.Vector3(0,lookHeight,0));
  const camPos=target.clone().add(new THREE.Vector3(
    Math.sin(player.yaw)*Math.cos(player.pitch)*dist,
    Math.sin(player.pitch)*dist+player.scale*.15,
    Math.cos(player.yaw)*Math.cos(player.pitch)*dist
  ));
  camera.position.lerp(camPos,Math.min(1,dt*13));
  camera.lookAt(target);
}
function updateMobs(dt,time){
  for(const mob of mobs){
    const body=mob.body;
    if(mob.kind==='robot')mob.group.rotation.y=Math.sin(time*.4+mob.phase)*.45;
    if(body.position.y<.25*mob.scale)body.position.y=.42*mob.scale;
    const speed=(mob.kind==='cat'?.7:.4)*(mob.scale*.4+.6);
    const dx=Math.sin(time*.5+mob.phase),dz=Math.cos(time*.38+mob.phase*1.7);
    const distance=Math.hypot(body.position.x,body.position.z);
    body.velocity.x=distance>22?-body.position.x/distance*speed:dx*speed;
    body.velocity.z=distance>22?-body.position.z/distance*speed:dz*speed;
    mob.group.position.set(body.position.x,body.position.y-.42*mob.scale,body.position.z);
  }
}
function handlePortals(time){
  if(!portals[0]||!portals[1])return;
  const travelers=[
    {type:'player',position:player.position.clone().add(new THREE.Vector3(0,player.scale*.88,0)),velocity:new THREE.Vector3(playerMotion.x,player.yVel,playerMotion.z),last:player.portalTime,ref:player},
    ...blocks.filter(b=>b.dynamic).map(b=>({type:'body',position:new THREE.Vector3(b.body.position.x,b.body.position.y,b.body.position.z),velocity:new THREE.Vector3(b.body.velocity.x,b.body.velocity.y,b.body.velocity.z),last:b.portalTime,ref:b})),
    ...mobs.map(m=>({type:'body',position:new THREE.Vector3(m.body.position.x,m.body.position.y,m.body.position.z),velocity:new THREE.Vector3(m.body.velocity.x,m.body.velocity.y,m.body.velocity.z),last:m.portalTime,ref:m})),
    ...balls.map(b=>({type:'body',position:new THREE.Vector3(b.body.position.x,b.body.position.y,b.body.position.z),velocity:new THREE.Vector3(b.body.velocity.x,b.body.velocity.y,b.body.velocity.z),last:b.portalTime,ref:b}))
  ];
  for(const traveler of travelers){
    if(time-traveler.last<1.2)continue;
    for(let i=0;i<2;i++){
      const src=portals[i],dst=portals[1-i];
      const local=src.group.worldToLocal(traveler.position.clone());
      if(Math.abs(local.x)>.75||Math.abs(local.y)>1.12||local.z<-.2||local.z>.65)continue;
      if(traveler.velocity.dot(src.normal)>-.16)continue;
      const dest=dst.point.clone().addScaledVector(dst.normal,1.45);
      const diff=Math.atan2(dst.normal.x,dst.normal.z)-Math.atan2(src.normal.x,src.normal.z)+Math.PI;
      const cs=Math.cos(diff),sn=Math.sin(diff);
      const v=traveler.velocity;
      const newV=new THREE.Vector3(v.x*cs+v.z*sn,v.y,-v.x*sn+v.z*cs);
      if(traveler.type==='player'){
        player.position.copy(dest);player.position.y=Math.max(0,dest.y-player.scale*.88);
        player.yaw+=diff;
        player.yVel=newV.y;player.portalTime=time;
      }else{
        traveler.ref.body.position.set(dest.x,dest.y,dest.z);
        traveler.ref.body.velocity.set(newV.x,newV.y,newV.z);
        traveler.ref.body.wakeUp();traveler.ref.portalTime=time;
      }
      break;
    }
  }
}
let lastTime=performance.now(),accumulator=0;
function frame(){
  requestAnimationFrame(frame);
  const now=performance.now(),dt=Math.min((now-lastTime)/1000,.04);lastTime=now;
  const time=now/1000;
  updatePlayer(dt);
  for(const mob of mobs){
    const body=mob.body;
    const speed=(mob.kind==='cat'?.7:.4)*(mob.scale*.4+.6);
    const dx=Math.sin(time*.5+mob.phase),dz=Math.cos(time*.38+mob.phase*1.7);
    const dist=Math.hypot(body.position.x,body.position.z);
    body.velocity.x=dist>22?-body.position.x/dist*speed:dx*speed;
    body.velocity.z=dist>22?-body.position.z/dist*speed:dz*speed;
  }
  if(heldBlock&&heldBlock.dynamic){
    const target=camera.position.clone().add(new THREE.Vector3(-Math.sin(player.yaw)*2,Math.sin(player.pitch),-Math.cos(player.yaw)*2));
    const d=target.sub(new THREE.Vector3(heldBlock.body.position.x,heldBlock.body.position.y,heldBlock.body.position.z));
    const vel=d.multiplyScalar(9).clampLength(0,22);
    heldBlock.body.velocity.set(vel.x,vel.y,vel.z);heldBlock.body.wakeUp();
  }
  accumulator+=dt;
  let steps=0;
  while(accumulator>=1/60&&steps<3){world.step(1/60);accumulator-=1/60;steps++;}
  updateMobs(dt,time);
  for(const b of blocks){
    if(b.dynamic){
      b.mesh.position.set(b.body.position.x,b.body.position.y,b.body.position.z);
      b.mesh.quaternion.set(b.body.quaternion.x,b.body.quaternion.y,b.body.quaternion.z,b.body.quaternion.w);
    }
  }
  for(const ball of [...balls]){
    ball.mesh.position.set(ball.body.position.x,ball.body.position.y,ball.body.position.z);
    ball.mesh.quaternion.set(ball.body.quaternion.x,ball.body.quaternion.y,ball.body.quaternion.z,ball.body.quaternion.w);
    if(now-ball.created>45000||ball.body.position.y< -30)removeBall(ball);
  }
  handlePortals(time);
  portals.forEach((portal,i)=>{
    if(!portal)return;
    portal.group.children[1].material.opacity=.22+Math.sin(time*2+i*2)*.065;
    portal.group.children[2].rotation.z=time*(i?-.4:.4);
  });
  preview.visible=false;
  if(activeTool==='build'&&document.querySelector('.intro-overlay.hidden')){
    const hit=getHit(null,false);
    if(hit){
      const size=placingPrefab>=0?.8:Number($('blockSize').value)||.25;
      const p=blockPlacement(hit,size);
      preview.position.copy(p);preview.scale.setScalar(size*1.02);preview.visible=true;
      preview.material.color.set(placingPrefab>=0?'#ffcb83':'#b5fce4');
    }
  }
  renderer.render(scene,camera);
}
try{
  const data=localStorage.getItem(SAVE_PREFIX+'1');
  if(data)restoreWorld(JSON.parse(data));else seedWorld();
}catch(error){console.warn('Pens save load failed',error);seedWorld();}
setTool('build');frame();
// Saves are explicit: changing worlds never silently overwrites an existing slot.
