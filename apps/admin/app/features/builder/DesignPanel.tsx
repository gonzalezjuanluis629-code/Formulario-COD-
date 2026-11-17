import { useState, type ReactNode } from 'react';
import {
  BlockStack, Button, ButtonGroup, Checkbox, Collapsible, Divider, Icon, InlineStack, RangeSlider, Select, Text, TextField,
} from '@shopify/polaris';
import {
  ButtonIcon, CartIcon, ChevronDownIcon, ChevronRightIcon, ColorIcon, DeleteIcon, PlusIcon, SettingsIcon, TextFontIcon,
} from '@shopify/polaris-icons';
import type { SubmitButton, ThemeTokens, TriggerButton } from '@cod/contracts';

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
          <Color label="Color del botón" value={t.submit.bg} onChange={(v) => setSubmit({ bg: v })} />
          <Color label="Color del texto" value={t.submit.color} onChange={(v) => setSubmit({ color: v })} />
          <Color label="Color cuando está todo completo" value={t.submit.readyBg} onChange={(v) => setSubmit({ readyBg: v })} />
          <RangeSlider label="Alto" output suffix={<Px v={t.submit.height} />} min={38} max={72}
            value={t.submit.height} onChange={(v) => setSubmit({ height: v as number })} />
          <RangeSlider label="Tamaño del texto" output suffix={<Px v={t.submit.fontSize} />} min={12} max={24}
            value={t.submit.fontSize} onChange={(v) => setSubmit({ fontSize: v as number })} />
          <RangeSlider label="Esquinas" output suffix={<Px v={t.submit.radius} />} min={0} max={40}
            value={t.submit.radius} onChange={(v) => setSubmit({ radius: v as number })} />
          <Choice label="Animación" value={t.submit.animation} onChange={(v) => setSubmit({ animation: v as SubmitButton['animation'] })}
            options={[['none', 'Ninguna'], ['pulse', 'Latido'], ['shine', 'Brillo']]} />
        </>
      ))}

      {section('trigger', 'Botón «Comprar ahora» (ventana emergente)', CartIcon, (
        <>
          <Text as="p" variant="bodySm" tone="subdued">
            Solo se usa si el formulario se abre en una ventana al pulsar un botón. Lo ves arriba en la vista previa.
          </Text>
          <TextField label="Texto del botón" value={t.trigger.text} onChange={(v) => setTrigger({ text: v })} autoComplete="off" />
          <Color label="Color del botón" value={t.trigger.bg} onChange={(v) => setTrigger({ bg: v })} />
          <Color label="Color del texto" value={t.trigger.color} onChange={(v) => setTrigger({ color: v })} />
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
          <Choice label="Animación" value={t.trigger.animation} onChange={(v) => setTrigger({ animation: v as TriggerButton['animation'] })}
            options={[['none', 'Ninguna'], ['pulse', 'Latido'], ['shine', 'Brillo'], ['bounce', 'Rebote']]} />
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
