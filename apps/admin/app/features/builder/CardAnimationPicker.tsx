import { BlockStack, Button, ButtonGroup, Text } from '@shopify/polaris';
import { ANIMATION_SPEEDS } from '../../../../widget/src/ui/animations';
import { CARD_ANIMATIONS, cardAnimationCss, marchSvg, type CardAnimation } from '../../../../widget/src/ui/cardAnimations';

type Speed = keyof typeof ANIMATION_SPEEDS;

const DEMO_CSS = `
.cod-cdemo{position:relative;display:flex;align-items:center;gap:6px;width:100%;height:34px;padding:0 8px;border-radius:9px;
  font:600 10.5px/1.1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2a44;box-sizing:border-box}
.cod-cdemo i{flex:none;width:12px;height:12px;border:1.5px solid #9a9a9a;border-radius:3px;background:#fff}
${cardAnimationCss('cod-cdemo', '.cod-cdemo-done')}`;

/**
 * Animación de una tarjeta de extra. Cada opción se ve funcionando en una
 * tarjeta en miniatura con el borde y el fondo del extra: se elige viendo.
 */
export function CardAnimationPicker({
  value, speed, onChange, onSpeed, border, borderColor, background,
}: {
  value: CardAnimation;
  speed: Speed;
  onChange: (v: CardAnimation) => void;
  onSpeed: (s: Speed) => void;
  border: 'dashed' | 'solid' | 'none';
  borderColor: string;
  background: string;
}) {
  return (
    <BlockStack gap="200">
      <style>{DEMO_CSS}</style>
      <Text as="span" variant="bodyMd">Animación</Text>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {CARD_ANIMATIONS.map((a) => {
          const on = a.id === value;
          return (
            <button key={a.id} type="button" onClick={() => onChange(a.id)} aria-pressed={on}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer', padding: '10px 8px 7px',
                borderRadius: 10, background: on ? 'var(--p-color-bg-surface-selected, #f1f6fe)' : 'var(--p-color-bg-surface-secondary)',
                border: `1.5px solid ${on ? '#005bd3' : 'var(--p-color-border-secondary)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              }}>
              <span className={`cod-cdemo${a.id === 'none' ? '' : ` cod-cdemo-anim-${a.id}`}`}
                style={{
                  border: border === 'none' ? '1.5px solid transparent' : `1.5px ${border} ${borderColor}`,
                  background, ['--card-color' as string]: borderColor, ['--anim-speed' as string]: ANIMATION_SPEEDS[speed],
                }}
                dangerouslySetInnerHTML={{ __html: `${a.id === 'march' ? marchSvg('cod-cdemo', 8) : ''}<i></i>Agrega por RD$ 350` }} />
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
          <Text as="p" variant="bodySm" tone="subdued">Se detiene cuando el cliente marca el extra.</Text>
        </BlockStack>
      )}
    </BlockStack>
  );
}
