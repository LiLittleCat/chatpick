import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

interface SettingsSelectProps<Value extends string> {
  labelId: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSelect<Value extends string>({
  labelId, value, options, onChange, open, onOpenChange,
}: SettingsSelectProps<Value>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 32 };

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setPlacement(below < panel.offsetHeight + 8 && rect.top > below ? 'top' : 'bottom');
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open, onOpenChange]);

  const show = (index = selectedIndex) => {
    setActiveIndex(Math.max(0, index));
    onOpenChange(true);
  };
  const select = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    onOpenChange(false);
    triggerRef.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        if (!open) show();
        else setActiveIndex((index) => (index + step + options.length) % options.length);
        break;
      }
      case 'Home':
      case 'End':
        event.preventDefault();
        show(event.key === 'Home' ? 0 : options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) select(activeIndex);
        else show();
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(false);
        }
        break;
      case 'Tab':
        onOpenChange(false);
        break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const index = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
        if (index >= 0) {
          event.preventDefault();
          show(index);
        }
      }
    }
  };

  return (
    <div ref={rootRef} className="settings-select" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false);
    }}>
      <motion.button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby={`${labelId} ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        className="settings-select-trigger"
        onClick={() => open ? onOpenChange(false) : show()}
        onKeyDown={onKeyDown}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
        transition={transition}
      >
        <span id={`${id}-value`}>{options[selectedIndex]?.label}</span>
        <motion.span aria-hidden="true" className="settings-select-chevron"
          animate={{ rotate: open ? 180 : 0 }} transition={transition}>
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>
      <div className={`settings-select-popup settings-select-popup-${placement}`} inert={!open}>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              id={`${id}-list`}
              role="listbox"
              aria-labelledby={labelId}
              className="settings-select-panel"
              initial={{ opacity: 0, y: reduceMotion ? 0 : placement === 'top' ? 5 : -5, scale: reduceMotion ? 1 : 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : placement === 'top' ? 5 : -5, scale: reduceMotion ? 1 : 0.97 }}
              transition={transition}
              style={{ transformOrigin: placement === 'top' ? 'bottom' : 'top' }}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  className="settings-select-option"
                  onPointerMove={() => setActiveIndex(index)}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => select(index)}
                >
                  {index === activeIndex && <motion.div aria-hidden="true" className="settings-select-highlight"
                    layoutId={`${id}-highlight`} transition={transition} />}
                  <span>{option.label}</span>
                  {option.value === value && <Check aria-hidden="true" size={14} />}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
