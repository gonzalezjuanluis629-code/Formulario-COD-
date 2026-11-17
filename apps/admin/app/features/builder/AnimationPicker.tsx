import { BlockStack, Button, ButtonGroup, Text } from '@shopify/polaris';
import {
  ANIMATION_SPEEDS, BUTTON_ANIMATIONS, buttonAnimationCss, type ButtonAnimation,
} from '../../../../widget/src/ui/animations';

type Speed = keyof typeof ANIMATION_SPEEDS;

const DEMO_CSS = `
.cod-demo{display:flex;align-items:center;justify-content:center;width:100%;height:28px;border-radius:8px;
  color:#fff;font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--demo-bg)}
${buttonAnimationCss('cod-demo', 'var(--demo-solid)')}`;

/**
 * Cada animación se muestra funcionando en un botón en miniatura con los
 * colores del botón real: se elige viendo, no adivinando.
 */
export function AnimationPicker({
  value, speed, onChange, onSpeed, background, solid,
}: {
  value: ButtonAnimation;
  speed: Speed;
  onChange: (v: ButtonAnimation) => void;
  onSpeed: (s: Speed) => void;
  background: string;
  solid: string;
}) {
  return (
    <BlockStack gap="200">
      <style>{DEMO_CSS}</style>
      <Text as="span" variant="bodyMd">Animación</Text>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {BUTTON_ANIMATIONS.map((a) => {
          const on = a.id === value;
          return (
            <button key={a.id} type="button" onClick={() => onChange(a.id)} aria-pressed={on}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer', padding: '10px 8px 7px',
                borderRadius: 10, background: on ? '#f1f6fe' : '#fafafa',
                border: `1.5px solid ${on ? '#005bd3' : '#e3e3e3'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              }}>
              <span className={`cod-demo cod-demo-anim-${a.id}`}
                style={{ ['--demo-bg' as string]: background, ['--demo-solid' as string]: solid, ['--anim-speed' as string]: ANIMATION_SPEEDS[speed] }}>
                Comprar
              </span>
              <Text as="span" variant="bodySm" fontWeight={on ? 'semibold' : 'regular'}>{a.label}</Text>
            </button>
          );
        })}
      </div>
      {value !== 'none' && (
        <BlockStack gap="100">
          <Text as="span" variant="bodyMd">Velocidad</Text>
          <ButtonGroup variant="segmented" fullWidth>
            {([['slow', 'Lenta'], ['normal', 'Normal'], ['fast', 'Rápida']] as const).map(([v, l]) => (
              <Button key={v} size="slim" pressed={speed === v} onClick={() => onSpeed(v)}>{l}</Button>
            ))}
          </ButtonGroup>
        </BlockStack>
      )}
    </BlockStack>
  );
}
