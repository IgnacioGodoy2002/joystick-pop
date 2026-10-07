import Phaser from 'phaser'
import SceneKeys from '~/consts/SceneKeys'
import MusicController from '~/game/MusicController'
import {CharacterStage, CHARACTERS, selectedCharacter, saveCharacter, CharacterId} from '~/characters/CharacterStage'
import {i18next, USER_LANGUAGE_STORAGE_KEY} from '~/i18n'
import {STORAGE_KEY_RECORD} from '~/integration/sura/SuraIntegrationService'
import '../styles/character-menu.css'
export default class TitleScreen extends Phaser.Scene {
 private host?:HTMLElement;private stage?:CharacterStage;private selected=selectedCharacter();private keyHandler?: (e:KeyboardEvent)=>void;
 create(){
  document.body.dataset.popScreen='menu';this.selected=selectedCharacter();
  const lang=i18next.language.slice(0,2);const es=lang!=='en'&&lang!=='pt';const pt=lang==='pt';
  const txt={choose:es?'ELEGÍ TU PERSONAJE':pt?'ESCOLHA SEU PERSONAGEM':'CHOOSE YOUR CHARACTER',play:es?'JUGAR':pt?'JOGAR':'PLAY',how:es?'Cómo jugar':pt?'Como jogar':'How to play',rank:es?'Ranking':pt?'Ranking':'Leaderboard',rotate:es?'Girar':pt?'Girar':'Rotate',hint:es?'Mantené presionado para apuntar. Soltá para disparar.':pt?'Segure para mirar. Solte para disparar.':'Hold to aim. Release to shoot.',rule:es?'Uní 3 del mismo color y sumá puntos.':pt?'Combine 3 da mesma cor e ganhe pontos.':'Match 3 of the same color and score points.',record:es?'TU RÉCORD':pt?'SEU RECORDE':'YOUR BEST'};
  const host=document.createElement('section');host.className='pop-menu';host.setAttribute('aria-label','Menú Joystick Pop');this.host=host;
  host.innerHTML=`<div class="pop-shell"><header class="pop-top"><span class="pop-brand"><b>✚</b> JOYSTICK POP</span><div class="pop-record"><span>${txt.record}</span><strong>${Number(localStorage.getItem(STORAGE_KEY_RECORD)||0)}</strong></div><button class="pop-sound" aria-label="Música" aria-pressed="${!MusicController.isMuted()}">${MusicController.isMuted()?'🔇':'🔊'}</button></header><main class="pop-main"><div class="pop-intro"><h1 class="pop-title"><span>JOYSTICK</span><span>POP!</span></h1><p class="pop-rule">${txt.rule}</p><button class="pop-play">${txt.play}</button><div class="pop-secondary"><button data-action="how">${txt.how}</button><button data-action="ranking">${txt.rank}</button></div><div class="pop-instruction"><span>✚</span><p>${txt.hint}</p></div></div><div class="pop-characters"><div class="pop-select-header"><span>${txt.choose}</span><span class="pop-index"></span></div><div class="pop-showcase"><div class="pop-stage"></div><button class="pop-arrow pop-prev" aria-label="Personaje anterior">‹</button><button class="pop-arrow pop-next" aria-label="Personaje siguiente">›</button><div class="pop-character-name"></div><button class="pop-rotate" aria-pressed="false">↻ ${txt.rotate}</button></div><div class="pop-cards">${CHARACTERS.map(c=>`<button class="pop-card" data-character="${c.id}" aria-pressed="false"><span class="pop-check">✓</span><img alt="${c.name}"/><span>${c.name}</span></button>`).join('')}</div></div></main><footer class="pop-footer"><span class="pop-footer-hint">${txt.hint}</span><div class="pop-langs">${['es','en','pt'].map(l=>`<button data-lang="${l}" aria-pressed="${lang===l}">${l.toUpperCase()}</button>`).join('')}</div></footer></div>`;
  document.body.appendChild(host);
  document.getElementById('pop-boot')?.remove();
  try{this.stage=new CharacterStage(host.querySelector('.pop-stage')!,this.selected);const images=this.stage.thumbnails();host.querySelectorAll<HTMLImageElement>('.pop-card img').forEach(img=>{img.src=images[img.parentElement!.dataset.character!]})}catch(e){console.error(e);host.querySelector('.pop-stage')!.textContent='No se pudo cargar el personaje. Recargá la página.'}
  this.select(this.selected);
  host.querySelector('.pop-play')!.addEventListener('click',()=>this.scene.start(SceneKeys.TipsInterstitial,{target:SceneKeys.Game}));
  host.querySelector('[data-action="how"]')!.addEventListener('click',()=>this.scene.start(SceneKeys.HowToPlay));host.querySelector('[data-action="ranking"]')!.addEventListener('click',()=>this.scene.start(SceneKeys.Leaderboard));
  host.querySelectorAll<HTMLElement>('[data-character]').forEach(b=>b.addEventListener('click',()=>this.select(b.dataset.character as CharacterId)));
  host.querySelector('.pop-prev')!.addEventListener('click',()=>this.cycle(-1));host.querySelector('.pop-next')!.addEventListener('click',()=>this.cycle(1));
  host.querySelector('.pop-rotate')!.addEventListener('click',e=>(e.currentTarget as HTMLElement).setAttribute('aria-pressed',String(this.stage?.rotate())));
  host.querySelector('.pop-sound')!.addEventListener('click',e=>{MusicController.toggleMute();const b=e.currentTarget as HTMLElement;b.textContent=MusicController.isMuted()?'🔇':'🔊';b.setAttribute('aria-pressed',String(!MusicController.isMuted()))});
  host.querySelectorAll<HTMLElement>('[data-lang]').forEach(b=>b.addEventListener('click',()=>{localStorage.setItem(USER_LANGUAGE_STORAGE_KEY,b.dataset.lang!);i18next.changeLanguage(b.dataset.lang!).then(()=>this.scene.restart())}));
  this.keyHandler=e=>{if(e.key==='ArrowLeft'){e.preventDefault();this.cycle(-1)}if(e.key==='ArrowRight'){e.preventDefault();this.cycle(1)}};window.addEventListener('keydown',this.keyHandler);
  this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.stage?.destroy();this.stage=undefined;this.host?.remove();if(this.keyHandler)window.removeEventListener('keydown',this.keyHandler);document.body.dataset.popScreen='game'});
 }
 private cycle(step:number){const i=CHARACTERS.findIndex(c=>c.id===this.selected);this.select(CHARACTERS[(i+step+4)%4].id)}
 private select(id:CharacterId){this.selected=id;saveCharacter(id);this.stage?.select(id);const i=CHARACTERS.findIndex(c=>c.id===id);this.host!.querySelector('.pop-index')!.textContent=`0${i+1} / 04`;this.host!.querySelector('.pop-character-name')!.textContent=CHARACTERS[i].name;this.host!.querySelector('.pop-rotate')!.setAttribute('aria-pressed','false');this.host!.querySelectorAll<HTMLElement>('[data-character]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.character===id)))}
}
