import { animate } from 'motion';

export function createNavigationMotion() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new WeakMap<HTMLElement, ReturnType<typeof animate>>();
  const panels = new WeakMap<HTMLElement, object>();
  const ease = [0.16, 1, 0.3, 1] as const;

  function reveal(element: HTMLElement) {
    animations.get(element)?.stop();
    animations.set(element, animate(element, { opacity: [0, 1] }, {
      duration: reducedMotion.matches ? 0 : 0.18,
      ease,
    }));
  }

  return {
    reveal,
    panel(element: HTMLElement, visible: boolean, immediate = false) {
      animations.get(element)?.stop();
      const state = {};
      panels.set(element, state);
      const wasHidden = element.hidden;
      element.inert = !visible;
      element.setAttribute('aria-hidden', String(!visible));
      element.style.pointerEvents = visible ? '' : 'none';
      if (immediate || reducedMotion.matches || !visible && wasHidden) {
        element.hidden = !visible;
        element.style.opacity = '';
        element.style.transform = '';
        animations.delete(element);
        return;
      }
      element.hidden = false;
      animations.set(element, animate(element, {
        opacity: visible && wasHidden ? [0, 1] : visible ? 1 : 0,
        x: visible && wasHidden ? [6, 0] : visible ? 0 : 6,
      }, {
        duration: visible ? 0.16 : 0.12,
        ease,
        onComplete: () => {
          if (panels.get(element) !== state) return;
          if (!visible) element.hidden = true;
          animations.delete(element);
        },
      }));
    },
    resize(element: HTMLElement, width: number, onUpdate: () => void) {
      animations.get(element)?.stop();
      animations.set(element, animate(element, { width }, reducedMotion.matches
        ? { duration: 0, onUpdate }
        : { type: 'spring', stiffness: 380, damping: 36, onUpdate }));
    },
    toast(element: HTMLElement, visible: boolean) {
      animations.get(element)?.stop();
      animations.set(element, animate(element, {
        opacity: visible ? 1 : 0,
        y: reducedMotion.matches || visible ? 0 : 6,
      }, { duration: reducedMotion.matches ? 0 : 0.18, ease }));
    },
    marquee(element: HTMLElement, distance: number) {
      animations.get(element)?.stop();
      if (reducedMotion.matches) {
        animations.set(element, animate(element, { x: 0 }, { duration: 0 }));
        return;
      }
      animations.set(element, animate(element, { x: -distance }, {
        duration: distance ? Math.max(0.8, distance / 55) : 0.2,
        ease: distance ? 'linear' : ease,
      }));
    },
    button(element: HTMLButtonElement) {
      let pressed = false;
      const update = () => {
        animations.get(element)?.stop();
        animations.set(element, animate(element, {
          scale: reducedMotion.matches || element.disabled || element.getAttribute('aria-disabled') === 'true' ? 1 : pressed ? 0.98 : 1,
        }, reducedMotion.matches
          ? { duration: 0 }
          : { type: 'spring', stiffness: 500, damping: 30 }));
      };
      element.addEventListener('pointerenter', update);
      element.addEventListener('pointerleave', () => { pressed = false; update(); });
      element.addEventListener('pointerdown', () => { pressed = true; update(); });
      element.addEventListener('pointerup', () => { pressed = false; update(); });
      element.addEventListener('pointercancel', () => { pressed = false; update(); });
      element.addEventListener('focus', update);
      element.addEventListener('blur', update);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { pressed = true; update(); }
      });
      element.addEventListener('keyup', () => { pressed = false; update(); });
    },
  };
}
