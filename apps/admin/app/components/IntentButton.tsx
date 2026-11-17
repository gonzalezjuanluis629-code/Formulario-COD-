import { Button, type ButtonProps } from '@shopify/polaris';
import { useSubmit } from 'react-router';

/**
 * Botón de Polaris que envía su <Form> con un `intent`.
 *
 * El <Button submit name value> de Polaris NO pasa `name` ni `value` al <button>
 * real, así que el servidor recibía el formulario sin `intent` y no hacía nada.
 * Este botón lee los campos del formulario que lo contiene y añade el intent.
 */
export function IntentButton({
  intent, extra, ...props
}: Omit<ButtonProps, 'submit' | 'onClick' | 'url'> & { intent: string; extra?: Record<string, string> }) {
  const submit = useSubmit();
  return (
    <Button
      {...props}
      onClick={(...args: unknown[]) => {
        const event = args[0] as { currentTarget?: HTMLElement } | undefined;
        const form = event?.currentTarget?.closest('form');
        const data = form ? new FormData(form) : new FormData();
        data.set('intent', intent);
        for (const [k, v] of Object.entries(extra ?? {})) data.set(k, v);
        submit(data, { method: 'post' });
      }}
    />
  );
}
