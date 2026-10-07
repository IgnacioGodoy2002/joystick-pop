import * as T from 'three'
import {createCharacter, animateCharacter, disposeCharacter, CHARACTERS, CharacterId, CharacterRig, isCharacterId} from './Characters'
export {CHARACTERS, CharacterId}
export function selectedCharacter():CharacterId {try{const id=localStorage.getItem('joystick-pop-character');if(isCharacterId(id))return id}catch{}return 'raccoon'}
export function saveCharacter(id:CharacterId){try{localStorage.setItem('joystick-pop-character',id)}catch{}}
export class CharacterStage {
 private renderer:T.WebGLRenderer;private scene=new T.Scene();private camera=new T.PerspectiveCamera(33,1,.1,40);private rig:CharacterRig;private actor=new T.Group();private controller=new T.Group();private observer:ResizeObserver;private frameId=0;private alive=true;private angle=.12;private turning=false;private aim=0;private recoil=0;private lastTime=0;
 constructor(private host:HTMLElement,id:CharacterId,private compact=false){
  this.renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
  host.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('role','img');this.renderer.domElement.setAttribute('aria-label','Personaje con joystick animado');
  this.camera.position.set(compact?1.8:3.1,2.6,compact?7.5:7);this.camera.lookAt(0,1.3,0);
  this.scene.add(new T.HemisphereLight(0xf0f8ff,0x546478,2.8));const key=new T.DirectionalLight(0xffe7c8,3.6);key.position.set(-3,5,5);this.scene.add(key);const rim=new T.DirectionalLight(0x73d5ff,2.8);rim.position.set(4,3,-3);this.scene.add(rim);
  this.rig=createCharacter(id);this.actor.add(this.rig.root);this.scene.add(this.actor);this.makeJoystick();this.rig.body.add(this.controller);
  if(!compact){const pedestal=new T.Mesh(new T.CylinderGeometry(1.6,1.7,.23,64),new T.MeshStandardMaterial({color:0x244d7b,roughness:.6,metalness:.3}));pedestal.position.y=-.15;this.scene.add(pedestal);const ring=new T.Mesh(new T.TorusGeometry(1.59,.032,10,64),new T.MeshStandardMaterial({color:0x5bccff,emissive:0x3189d9,emissiveIntensity:1.8}));ring.rotation.x=Math.PI/2;ring.position.y=-.035;this.scene.add(ring)}
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();this.frameId=requestAnimationFrame(this.frame);
 }
 private makeJoystick(){const material=(color:number)=>new T.MeshStandardMaterial({color,roughness:.36,metalness:.15});const add=(geo:T.BufferGeometry,color:number,x:number,y:number,z:number)=>{const m=new T.Mesh(geo,material(color));m.position.set(x,y,z);this.controller.add(m);return m};
  const shell=add(new T.BoxGeometry(.69,.19,.39),0x253c61,0,0,0);shell.geometry=new T.BoxGeometry(.69,.19,.39);for(const s of [-1,1]){const grip=add(new T.SphereGeometry(.19,20,16),0x253c61,s*.3,-.045,.07);grip.scale.set(.9,.65,1.1)}
  for(const p of [[.23,.06,0xffc458],[.30,0,0xfc6d84],[.16,0,0x67dcac],[.23,-.06,0x59b6fc]])add(new T.SphereGeometry(.035,12,8),p[2],p[0],.115,p[1]);add(new T.CylinderGeometry(.05,.05,.08,16),0x162237,-.16,.125,0);add(new T.BoxGeometry(.15,.026,.047),0x8fa4ba,-.17,.11,-.08);add(new T.BoxGeometry(.047,.026,.15),0x8fa4ba,-.17,.11,-.08);this.placeController();
 }
 private placeController(){this.controller.position.set(0,this.rig.id==='capybara'?.85:1.03,this.rig.id==='capybara'?1.06:.66);this.controller.rotation.set(-.35,Math.PI,0);}
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix()}
 select(id:CharacterId){this.rig.body.remove(this.controller);this.actor.remove(this.rig.root);disposeCharacter(this.rig);this.rig=createCharacter(id);this.rig.body.add(this.controller);this.placeController();this.actor.add(this.rig.root);this.turning=false;this.angle=.12}
 rotate(){this.turning=!this.turning;return this.turning}
 setAim(value:number){this.aim=T.MathUtils.clamp(value,-1,1)}
 shoot(){this.recoil=1}
 thumbnails(){const old=this.rig.id;const images:Record<string,string>={};this.renderer.setSize(220,220);this.camera.aspect=1;this.camera.updateProjectionMatrix();for(const c of CHARACTERS){this.select(c.id);this.pose(0);this.renderer.render(this.scene,this.camera);images[c.id]=this.renderer.domElement.toDataURL('image/png')}this.select(old);this.resize();return images}
 private pose(time:number){animateCharacter(this.rig,time);const sway=Math.sin(time*.0017)*.024;this.rig.body.rotation.z+=sway-this.aim*.045;this.rig.head.rotation.y+=this.aim*.17;
  for(const limb of this.rig.limbs){const role=limb.userData.motionRole;const capFront=this.rig.id==='capybara'&&limb.position.z>0;if(role==='arm'||role==='wing'||capFront){limb.rotation.x=-.75-this.recoil*.12+this.aim*.05;limb.rotation.z=-limb.userData.side*.30}}
  this.controller.rotation.z=-this.aim*.17;this.controller.position.y=(this.rig.id==='capybara'?.85:1.03)-this.recoil*.07;this.controller.position.z=(this.rig.id==='capybara'?1.06:.66)-this.recoil*.08;this.rig.body.rotation.x+=this.recoil*.10;
 }
 private frame=(time:number)=>{if(!this.alive)return;this.frameId=requestAnimationFrame(this.frame);const dt=Math.min((time-(this.lastTime||time))/1000,.05);this.lastTime=time;if(document.hidden)return;if(this.turning)this.angle+=dt*.8;this.actor.rotation.y=this.angle;this.recoil*=Math.exp(-dt*12);this.pose(time);this.renderer.render(this.scene,this.camera)}
 destroy(){this.alive=false;cancelAnimationFrame(this.frameId);this.observer.disconnect();disposeCharacter(this.rig);this.scene.traverse(o=>{if(o instanceof T.Mesh&&!this.rig.root.getObjectById(o.id)){o.geometry.dispose();if(o.material instanceof T.Material)o.material.dispose()}});this.renderer.dispose();this.renderer.domElement.remove()}
}
