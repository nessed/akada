/**
 * Which hand is on the page: a finger (or a pen) or a cursor.
 *
 * Media queries cannot answer this on the machines where it matters most. A
 * 2-in-1 folded into a tablet still has its touchpad, so Windows keeps
 * reporting `pointer: fine` and `hover: hover` while the reader taps the
 * glass, and anything the stylesheet hid until hover stayed hidden. So the
 * page watches what actually happens instead: a touch or a pen puts
 * `data-input="touch"` on <html>, a mouse that moves a few pixels puts it
 * back to `mouse`. Flip the laptop over and the page follows on the first
 * tap, flip it back and it follows on the first nudge of the touchpad.
 *
 * The first guess, before anything has been touched, comes from the primary
 * pointer, then from what the reader last used on this device, so a tablet
 * reloaded in tablet mode opens in touch mode rather than a tap later.
 *
 * `touch:` and `mouse:` in tailwind.config.ts read the attribute, and so does
 * every `hover:`, which is quiet in touch mode: a finger leaves a hover stuck
 * on whatever it last tapped. Kept apart from any component so the root
 * layout's bootstrap pulls in nothing else.
 */
export const INPUT_KEY = 'akada.input';

/** How far a mouse must travel before it counts as the reader switching. */
const MOUSE_TRAVEL = 12;

export const INPUT_BOOTSTRAP_SCRIPT = `(function(){try{
var d=document.documentElement,w=window,K=${JSON.stringify(INPUT_KEY)};
function q(s){return !!(w.matchMedia&&w.matchMedia(s).matches);}
function set(v){if(d.getAttribute('data-input')===v)return;d.setAttribute('data-input',v);try{w.localStorage.setItem(K,v);}catch(e){}}
var last=null;try{last=w.localStorage.getItem(K);}catch(e){}
var canTouch=(navigator.maxTouchPoints||0)>0||q('(any-pointer: coarse)');
d.setAttribute('data-input',q('(pointer: coarse)')||(canTouch&&last==='touch')?'touch':'mouse');
w.addEventListener('pointerdown',function(e){set(e.pointerType==='mouse'?'mouse':'touch');},{capture:true,passive:true});
var travel=0,lx=null,ly=null;
w.addEventListener('pointermove',function(e){
if(e.pointerType!=='mouse'||d.getAttribute('data-input')!=='touch'){lx=null;return;}
if(lx!==null)travel+=Math.abs(e.clientX-lx)+Math.abs(e.clientY-ly);
lx=e.clientX;ly=e.clientY;
if(travel>${MOUSE_TRAVEL}){travel=0;lx=null;set('mouse');}
},{capture:true,passive:true});
if(w.matchMedia){var mq=w.matchMedia('(pointer: coarse)');var on=function(){set(mq.matches?'touch':'mouse');};
if(mq.addEventListener)mq.addEventListener('change',on);else if(mq.addListener)mq.addListener(on);}
}catch(e){}})();`;

/**
 * How much of the page an on-screen keyboard is covering.
 *
 * Every sheet in the app rises from the foot of the screen, and on a tablet
 * the keyboard that comes up for its first field is half the screen tall: in
 * Safari, and in Chrome by default, it slides over the page without the page
 * knowing, straight across the field being typed in. The visual viewport does
 * know, so this writes the gap between it and the layout viewport's foot as
 * `--keyboard`, and what is still visible as `--visible`, and sets
 * `data-keyboard` on <html> while one is up. `.sheet-lift` in globals.css
 * stands a sheet on it. Zoomed in, the gap is the zoom, not a keyboard, and
 * reads as none.
 */
export const KEYBOARD_BOOTSTRAP_SCRIPT = `(function(){try{
var w=window,v=w.visualViewport,d=document.documentElement;if(!v)return;
var up=false,f=0;
function measure(){f=0;
var gap=v.scale>1.05?0:Math.max(0,Math.round(w.innerHeight-v.height-v.offsetTop));
var now=gap>120;
d.style.setProperty('--keyboard',(now?gap:0)+'px');
d.style.setProperty('--visible',Math.round(v.height)+'px');
if(now===up)return;up=now;
if(now){d.setAttribute('data-keyboard','');var a=document.activeElement;
if(a&&a.scrollIntoView&&a!==document.body)setTimeout(function(){a.scrollIntoView({block:'nearest'});},260);}
else d.removeAttribute('data-keyboard');}
function soon(){if(!f)f=requestAnimationFrame(measure);}
v.addEventListener('resize',soon);v.addEventListener('scroll',soon);
}catch(e){}})();`;

/** Whether the reader is on a touch screen right now. */
export function isTouchInput(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.input === 'touch';
}
