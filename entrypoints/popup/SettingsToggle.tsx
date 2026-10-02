import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';

export function SettingsToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  return (
    <div className="settings-toggle-row">
      <label htmlFor={id}>{label}</label>
      <button id={id} type="button" role="switch" aria-checked={checked}
        aria-label={label} className="settings-toggle" onClick={() => onChange(!checked)}>
        <motion.span aria-hidden="true" className="settings-toggle-thumb"
          animate={{ x: checked ? 18 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 35 }} />
      </button>
    </div>
  );
}
