import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Run the production carousel with a deterministic clock and synthetic DOM.
// Assert the visitor-visible selection across playback and interaction boundaries.
class Element {
  listeners = new Map();
  attributes = new Map();
  styles = new Map();
  children = new Map();
  classes = new Set();
  dataset = {};
  style = { setProperty: (key, value) => this.styles.set(key, value) };
  classList = {
    add: name => this.classes.add(name),
    toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
  };
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  emit(name, event = {}) { this.listeners.get(name)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector(selector) { return this.children.get(selector); }
  matches() { return false; }
  contains() { return false; }
}
const story = new Element();
const viewport = new Element();
viewport.clientHeight = 700;
const steps = Array.from({ length: 4 }, () => new Element());
const markers = Array.from({ length: 4 }, () => new Element());
const playback = new Element();
playback.dataset = { playLabel: 'Start autoplay', pauseLabel: 'Pause autoplay' };
playback.children.set('[data-playback-icon="play"]', new Element());
playback.children.set('[data-playback-icon="pause"]', new Element());
story.children.set('.feature-viewport', viewport);
story.children.set('.feature-playback', playback);
story.querySelectorAll = selector => selector === '.feature-step' ? steps : markers;
const document = new Element();
document.hidden = false;
document.querySelector = () => story;
const motion = new Element();
motion.matches = false;
let intersection;
let time = 100;
let id = 0;
const frames = new Map();
const timers = new Map();
const source = fs.readFileSync(new URL('../website/assets/site.js', import.meta.url), 'utf8');
class VisibilityObserver { constructor(callback) { intersection = callback; } observe() {} }
vm.runInNewContext(source.slice(source.indexOf('const story =')), {
  document, window: { matchMedia: () => motion, IntersectionObserver: VisibilityObserver },
  requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
  cancelAnimationFrame(key) { frames.delete(key); },
  setTimeout(callback, delay) { timers.set(++id, { callback, due: time + delay }); return id; },
  clearTimeout(key) { timers.delete(key); },
  IntersectionObserver: VisibilityObserver,
});
function advance(milliseconds) {
  for (let remaining = milliseconds; remaining > 0; remaining -= 20) {
    time += Math.min(20, remaining);
    for (const [key, timer] of timers) if (timer.due <= time) { timers.delete(key); timer.callback(); }
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(time));
  }
}
const active = () => markers.findIndex(marker => marker.attributes.get('aria-current') === 'true');
const see = on => intersection([{ isIntersecting: on, intersectionRatio: on ? 1 : 0 }]);
const key = name => story.emit('keydown', { key: name, preventDefault() {} });
const wheel = (delta, options = {}) => {
  let prevented = false;
  story.emit('wheel', { deltaY: delta, deltaX: 0, deltaMode: 0, ...options, preventDefault() { prevented = true; } });
  return prevented;
};

advance(12000);
assert.equal(active(), 0, 'Offscreen carousel must not advance');
see(true);
advance(6100);
assert.equal(active(), 1, 'Visible carousel must automatically replace the first feature');
assert.equal(steps.filter(step => step.attributes.get('aria-hidden') === 'false').length, 1);
story.emit('pointerenter', { pointerType: 'mouse' });
advance(12000);
assert.equal(active(), 1, 'Hover must pause playback');
story.emit('pointerleave');
advance(6100);
assert.equal(active(), 2, 'Playback must resume after hover');
story.emit('focusin');
advance(12000);
assert.equal(active(), 2, 'Keyboard focus must pause playback');
story.emit('focusout', { relatedTarget: null });
document.hidden = true;
document.emit('visibilitychange');
advance(12000);
assert.equal(active(), 2, 'Hidden tab must not advance');
document.hidden = false;
document.emit('visibilitychange');
see(false);
advance(12000);
assert.equal(active(), 2, 'Leaving the viewport must stop playback');
see(true);
playback.emit('click');
advance(12000);
assert.equal(active(), 2, 'Explicit pause must persist');
playback.emit('click');
advance(6100);
assert.equal(active(), 3);
advance(6100);
assert.equal(active(), 0, 'Autoplay must loop from the final feature');
motion.matches = true;
motion.emit('change');
advance(12000);
assert.equal(active(), 0, 'Reduced motion must default to manual playback');
markers[2].emit('click');
assert.equal(active(), 2, 'Vertical progress segments must select a feature');
key('Home');
assert.equal(active(), 0);
key('ArrowDown');
assert.equal(active(), 1);
key('End');
key('ArrowDown');
assert.equal(active(), 3, 'Manual navigation must stop at the final feature');
key('Home');
assert.equal(wheel(60), true, 'Wheel inside the carousel must not scroll the page');
wheel(80);
wheel(80);
assert.equal(active(), 1, 'Trackpad inertia must not skip several features');
advance(400);
wheel(60);
assert.equal(active(), 2, 'A new wheel gesture must select the next feature');

advance(400);
key('Home');
wheel(60);
for (let i = 0; i < 10; i++) {
  advance(100);
  wheel(60);
}
assert.equal(active(), 3, 'Continuous wheel input must continue through the features without requiring a complete stop');
advance(600);
assert.equal(wheel(60), false, 'Scrolling down past the final feature must release the page');
key('Home');
advance(600);
assert.equal(wheel(-60), false, 'Scrolling up before the first feature must release the page');

wheel(60);
assert.equal(active(), 1);
wheel(-60);
assert.equal(active(), 0, 'Reversing direction must not be blocked by the previous switch');
assert.equal(wheel(-60), true, 'The short transition cooldown must absorb same-direction inertia at the boundary');
advance(400);
assert.equal(wheel(-60), false, 'The cooldown must expire even when scrolling continues');
assert.equal(wheel(60, { ctrlKey: true }), false, 'Pinch-to-zoom wheel input must remain available');
assert.equal(wheel(60, { deltaX: 120 }), false, 'Horizontal gestures must remain available');
assert.equal(wheel(0), false);
assert.equal(active(), 0, 'Ignored input must not change the selected feature');
wheel(1, { deltaMode: 1 });
wheel(1, { deltaMode: 1 });
assert.equal(active(), 0, 'Small wheel movements should accumulate before switching');
wheel(1, { deltaMode: 1 });
assert.equal(active(), 1, 'Line-based mouse wheels must use the same switching threshold');
advance(400);
wheel(1, { deltaMode: 2 });
assert.equal(active(), 2, 'Page-based wheel input must select only the next feature');
console.log('Passed carousel autoplay, pause/resume, visibility, reduced motion and manual navigation');
