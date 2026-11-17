import { useState, type ReactNode } from 'react';
import {
  BlockStack, Button, ButtonGroup, Checkbox, Collapsible, Divider, Icon, InlineStack, RangeSlider, Select, Text, TextField,
} from '@shopify/polaris';
import {
  ButtonIcon, CartIcon, ChevronDownIcon, ChevronRightIcon, ColorIcon, DeleteIcon, PlusIcon, SettingsIcon, TextFontIcon,
} from '@shopify/polaris-icons';
import type { SubmitButton, ThemeTokens, TriggerButton } from '@cod/contracts';
import { AnimationPicker } from './AnimationPicker';

export type DesignSection = 'colors' | 'shape' | 'submit' | 'trigger' | 'extras';

/**
 * Diseño del formulario. Cada cambio se ve al instante en la vista previa de al
 * lado. Al abrir «Botón Comprar ahora» la vista previa muestra también ese botón.
 */
export function DesignPanel({
  tokens: t, onChange, open, onOpen,
}: {
  tokens: ThemeTokens;
  onChange: (t: ThemeTokens) => void;
  open: DesignSection | null;
  onOpen: (s: DesignSection | null) => void;
}) {
  const set = <K extends keyof ThemeTokens>(k: K, v: ThemeTokens[K]) => onChange({ ...t, [k]: v });
  const setTrigger = (p: Partial<TriggerButton>) => onChange({ ...t, trigger: { ...t.trigger, ...p } });
  const setSubmit = (p: Partial<SubmitButton>) => onChange({ ...t, submit: { ...t.submit, ...p } });

  const section = (id: DesignSection, title: string, icon: typeof ColorIcon, body: ReactNode) => (
    <div style={{ border: '1px solid #e3e3e3', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
      <button type="button" onClick={() => onOpen(open === id ? null : id)} aria-expanded={open === id}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', cursor: 'pointer' }}>
        <Icon source={icon} tone="base" />
        <span style={{ flex: 1 }}><Text as="span" variant="bodyMd" fontWeight="semibold">{title}</Text></span>
        <Icon source={open === id ? ChevronDownIcon : ChevronRightIcon} tone="subdued" />
      </button>
      <Collapsible open={open === id} id={`design-${id}`}>
        <div style={{ padding: '0 12px 14px' }}>
          <BlockStack gap="300">{body}</BlockStack>
        </div>
      </Collapsible>
    </div>
  );

  return (
    <BlockStack gap="200">
      {section('colors', 'Colores', ColorIcon, (
        <>
          <Color label="Color principal" help="Bordes al escribir y elementos marcados" value={t.brand} onChange={(v) => set('brand', v)} />
          <Color label="Fondo del formulario" value={t.surface} onChange={(v) => set('surface', v)} />
          <Color label="Fondo de los campos" value={t.field} onChange={(v) => set('field', v)} />
          <Color label="Bordes" value={t.border} onChange={(v) => set('border', v)} />
          <Color label="Texto" value={t.text} onChange={(v) => set('text', v)} />
          <Color label="Barra de progreso" value={t.progressColor} onChange={(v) => set('progressColor', v)} />
          <Color label="Errores" value={t.danger} onChange={(v) => set('danger', v)} />
          <Color label="Botón «Aplicar» (código de descuento)" value={t.applyBg} onChange={(v) => set('applyBg', v)} />
          <Color label="Texto del botón «Aplicar»" value={t.applyColor} onChange={(v) => set('applyColor', v)} />
        </>
      ))}

      {section('shape', 'Letra y formas', TextFontIcon, (
        <>
          <Select label="Tipo de letra" value={t.fontFamily}
            options={[
              { label: 'La de tu tienda', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' },
              { label: 'Inter', value: 'Inter, sans-serif' },
              { label: 'Poppins', value: 'Poppins, sans-serif' },
              { label: 'Montserrat', value: 'Montserrat, sans-serif' },
            ]}
            onChange={(v) => set('fontFamily', v)} />
          <RangeSlider label="Tamaño del texto" output suffix={<Px v={t.fontSize} />} min={12} max={18} step={0.5}
            value={t.fontSize} onChange={(v) => set('fontSize', v as number)} />
          <RangeSlider label="Esquinas de los campos" output suffix={<Px v={t.radius} />} min={0} max={24}
            value={t.radius} onChange={(v) => set('radius', v as number)} />
          <Choice label="Sombra" value={t.shadow} onChange={(v) => set('shadow', v as ThemeTokens['shadow'])}
            options={[['none', 'Sin'], ['sm', 'Suave'], ['md', 'Media'], ['lg', 'Fuerte']]} />
          <Choice label="Espacio entre campos" value={t.spacing} onChange={(v) => set('spacing', v as ThemeTokens['spacing'])}
            options={[['compact', 'Junto'], ['normal', 'Normal'], ['relaxed', 'Amplio']]} />
        </>
      ))}

      {section('submit', 'Botón «Finalizar pedido»', ButtonIcon, (
        <>
          <TextField label="Texto del botón" value={t.submit.text} onChange={(v) => setSubmit({ text: v })} autoComplete="off" />
          <Choice label="Precio dentro del botón" value={t.submit.priceDisplay}
            onChange={(v) => setSubmit({ priceDisplay: v as SubmitButton['priceDisplay'] })}
            options={[['none', 'No mostrar'], ['total', 'Total'], ['subtotal', 'Subtotal']]} />
          {t.submit.priceDisplay !== 'none' && (
            <Text as="p" variant="bodySm" tone="subdued">
              {t.submit.priceDisplay === 'total'
                ? 'Total: productos con descuentos + envío. Se actualiza al cambiar cantidad, provincia o código.'
                : 'Subtotal: productos con descuentos, sin el envío.'}
            </Text>
          )}
          <ButtonFill b={t.submit} onChange={setSubmit} />
          <Color label="Color del texto" value={t.submit.color} onChange={(v) => setSubmit({ color: v })} />
          <ButtonShadow b={t.submit} onChange={setSubmit} />
          <Color label="Color cuando está todo completo" value={t.submit.readyBg} onChange={(v) => setSubmit({ readyBg: v })} />
          <RangeSlider label="Alto" output suffix={<Px v={t.submit.height} />} min={38} max={72}
            value={t.submit.height} onChange={(v) => setSubmit({ height: v as number })} />
          <RangeSlider label="Tamaño del texto" output suffix={<Px v={t.submit.fontSize} />} min={12} max={24}
            value={t.submit.fontSize} onChange={(v) => setSubmit({ fontSize: v as number })} />
          <RangeSlider label="Esquinas" output suffix={<Px v={t.submit.radius} />} min={0} max={40}
            value={t.submit.radius} onChange={(v) => setSubmit({ radius: v as number })} />
          <AnimationPicker value={t.submit.animation} speed={t.submit.animationSpeed}
            onChange={(v) => setSubmit({ animation: v })} onSpeed={(v) => setSubmit({ animationSpeed: v })}
            background={fillCss(t.submit)} solid={t.submit.bg} />
        </>
      ))}

      {section('trigger', 'Botón «Comprar ahora» (ventana emergente)', CartIcon, (
        <>
          <Text as="p" variant="bodySm" tone="subdued">
            Solo se usa si el formulario se abre en una ventana al pulsar un botón. Lo ves arriba en la vista previa.
          </Text>
          <TextField label="Texto del botón" value={t.trigger.text} onChange={(v) => setTrigger({ text: v })} autoComplete="off" />
          <ButtonFill b={t.trigger} onChange={setTrigger} />
          <Color label="Color del texto" value={t.trigger.color} onChange={(v) => setTrigger({ color: v })} />
          <ButtonShadow b={t.trigger} onChange={setTrigger} />
          <Choice label="Ancho" value={t.trigger.width === '100%' ? '100%' : 'auto'}
            onChange={(v) => setTrigger({ width: v })} options={[['auto', 'Ajustado'], ['100%', 'Completo']]} />
          <RangeSlider label="Alto" output suffix={<Px v={t.trigger.height} />} min={36} max={96}
            value={t.trigger.height} onChange={(v) => setTrigger({ height: v as number })} />
          <RangeSlider label="Tamaño del texto" output suffix={<Px v={t.trigger.fontSize} />} min={12} max={28}
            value={t.trigger.fontSize} onChange={(v) => setTrigger({ fontSize: v as number })} />
          <RangeSlider label="Esquinas" output suffix={<Px v={t.trigger.radius} />} min={0} max={60}
            value={t.trigger.radius} onChange={(v) => setTrigger({ radius: v as number })} />
          <Choice label="Icono" value={t.trigger.iconType}
            onChange={(v) => setTrigger({ iconType: v as TriggerButton['iconType'] })}
            options={[['none', 'Sin icono'], ['emoji', 'Símbolo'], ['image', 'Imagen']]} />
          {t.trigger.iconType === 'emoji' && (
            <TextField label="Símbolo" value={t.trigger.icon} onChange={(v) => setTrigger({ icon: v })} autoComplete="off"
              helpText="Un carácter o emoji, por ejemplo 🛒" maxLength={4} />
          )}
          {t.trigger.iconType === 'image' && (
            <TextField label="Enlace (URL) de la imagen" value={t.trigger.iconImageUrl ?? ''}
              onChange={(v) => setTrigger({ iconImageUrl: v || null })} autoComplete="off"
              helpText="Súbela en Contenido → Archivos de Shopify y pega su enlace." />
          )}
          <AnimationPicker value={t.trigger.animation} speed={t.trigger.animationSpeed}
            onChange={(v) => setTrigger({ animation: v })} onSpeed={(v) => setTrigger({ animationSpeed: v })}
            background={fillCss(t.trigger)} solid={t.trigger.bg} />
          <Divider />
          <Text as="h3" variant="headingSm">Frases que rotan bajo el texto</Text>
          {t.trigger.descriptions.map((d, i) => (
            <InlineStack key={i} gap="200" wrap={false} blockAlign="center">
              <div style={{ flex: 1 }}>
                <TextField labelHidden label={`Frase ${i + 1}`} value={d} autoComplete="off"
                  onChange={(v) => { const a = [...t.trigger.descriptions]; a[i] = v; setTrigger({ descriptions: a }); }} />
              </div>
              <Button variant="tertiary" tone="critical" icon={DeleteIcon} accessibilityLabel="Quitar frase"
                onClick={() => setTrigger({ descriptions: t.trigger.descriptions.filter((_, j) => j !== i) })} />
            </InlineStack>
          ))}
          {t.trigger.descriptions.length < 5 && (
            <Button icon={PlusIcon} onClick={() => setTrigger({ descriptions: [...t.trigger.descriptions, ''] })}>Añadir frase</Button>
          )}
        </>
      ))}

      {section('extras', 'Más opciones', SettingsIcon, (
        <>
          <Checkbox label="Barra de progreso arriba del formulario" checked={t.progressBar} onChange={(v) => set('progressBar', v)} />
          <Checkbox label="Animaciones" checked={t.animations} onChange={(v) => set('animations', v)}
            helpText="Desactívalas si el formulario va lento en móviles antiguos." />
          <TextField label="CSS personalizado" value={t.customCss} onChange={(v) => set('customCss', v)}
            multiline={4} autoComplete="off" helpText="Solo si sabes CSS. No afecta al resto de tu tienda." />
        </>
      ))}
    </BlockStack>
  );
}

const fillCss = (b: { bg: string; bgType: string; bg2: string; gradientAngle: number }) =>
  b.bgType === 'gradient' ? `linear-gradient(${b.gradientAngle}deg, ${b.bg}, ${b.bg2})` : b.bg;

type Fill = { bg: string; bgType: 'solid' | 'gradient'; bg2: string; gradientAngle: number };

/** Fondo del botón: un color o un degradado de dos colores. */
function ButtonFill({ b, onChange }: { b: Fill; onChange: (p: Partial<Fill>) => void }) {
  const preview = b.bgType === 'gradient' ? `linear-gradient(${b.gradientAngle}deg, ${b.bg}, ${b.bg2})` : b.bg;
  return (
    <BlockStack gap="200">
      <Choice label="Fondo del botón" value={b.bgType} onChange={(v) => onChange({ bgType: v as Fill['bgType'] })}
        options={[['solid', 'Un color'], ['gradient', 'Degradado']]} />
      <Color label={b.bgType === 'gradient' ? 'Color inicial' : 'Color del botón'} value={b.bg} onChange={(v) => onChange({ bg: v })} />
      {b.bgType === 'gradient' && (
        <>
          <Color label="Color final" value={b.bg2} onChange={(v) => onChange({ bg2: v })} />
          <RangeSlider label="Dirección del degradado" output suffix={<Text as="span" variant="bodySm" tone="subdued">{b.gradientAngle}°</Text>}
            min={0} max={360} step={15} value={b.gradientAngle} onChange={(v) => onChange({ gradientAngle: v as number })} />
          <div style={{ height: 14, borderRadius: 7, background: preview, border: '1px solid #e3e3e3' }} />
        </>
      )}
    </BlockStack>
  );
}

type ShadowProps = { shadow: 'none' | 'sm' | 'md' | 'lg'; shadowColor: string };

/** Sombra del botón: intensidad y color. Se combina con cualquier animación. */
function ButtonShadow({ b, onChange }: { b: ShadowProps; onChange: (p: Partial<ShadowProps>) => void }) {
  return (
    <BlockStack gap="200">
      <Choice label="Sombra" value={b.shadow} onChange={(v) => onChange({ shadow: v as ShadowProps['shadow'] })}
        options={[['none', 'Sin'], ['sm', 'Suave'], ['md', 'Media'], ['lg', 'Fuerte']]} />
      {b.shadow !== 'none' && (
        <Color label="Color de la sombra" help="Negro para una sombra clásica, o el color del botón para un efecto de luz"
          value={b.shadowColor} onChange={(v) => onChange({ shadowColor: v })} />
      )}
    </BlockStack>
  );
}

function Px({ v }: { v: number }) {
  return <Text as="span" variant="bodySm" tone="subdued">{v} px</Text>;
}

function Choice({ label, value, options, onChange }: {
  label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void;
}) {
  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodyMd">{label}</Text>
      <ButtonGroup variant="segmented" fullWidth>
        {options.map(([v, l]) => (
          <Button key={v} size="slim" pressed={value === v} onClick={() => onChange(v)}>{l}</Button>
        ))}
      </ButtonGroup>
    </BlockStack>
  );
}

function Color({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: string }) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <label style={{ position: 'relative', width: 36, height: 36, flexShrink: 0, borderRadius: 8, border: '1px solid #d4d4d4', background: value, cursor: 'pointer', overflow: 'hidden' }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)} aria-label={label}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text as="p" variant="bodyMd">{label}</Text>
        {help && <Text as="p" variant="bodySm" tone="subdued">{help}</Text>}
      </div>
      <div style={{ width: 96 }}>
        <TextField labelHidden label={label} value={value} onChange={onChange} autoComplete="off" />
      </div>
    </InlineStack>
  );
}
