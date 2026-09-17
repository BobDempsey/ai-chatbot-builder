/**
 * The handful of components the dashboard and the widget both use. They are
 * plain function components taking `ref` as a prop, which React 19 allows, so
 * none of the `forwardRef` wrapping ai-frontend-advisor needed on React 18
 * appears here.
 *
 * Radix supplies the dialog, because focus movement and Escape handling are
 * the parts that are easy to get subtly wrong.
 */
import { Dialog as RadixDialog, ScrollArea as RadixScrollArea } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'acb:bg-accent acb:text-accent-ink acb:hover:opacity-90',
  ghost: 'acb:bg-transparent acb:text-ink acb:hover:bg-surface-muted',
  outline: 'acb:border acb:border-line acb:bg-surface acb:text-ink acb:hover:bg-surface-muted',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'acb:h-8 acb:px-3 acb:text-xs',
  md: 'acb:h-10 acb:px-4 acb:text-sm',
  icon: 'acb:h-10 acb:w-10',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'acb:inline-flex acb:items-center acb:justify-center acb:gap-2 acb:rounded-md acb:font-medium',
        'acb:transition-colors acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent',
        'acb:disabled:pointer-events-none acb:disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'acb:h-10 acb:w-full acb:rounded-md acb:border acb:border-line acb:bg-surface acb:px-3 acb:text-sm acb:text-ink',
        'acb:placeholder:text-ink-muted acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'acb:w-full acb:resize-none acb:rounded-md acb:border acb:border-line acb:bg-surface acb:p-3 acb:text-sm acb:text-ink',
        'acb:placeholder:text-ink-muted acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('acb:rounded-panel acb:border acb:border-line acb:bg-surface acb:p-4', className)} {...props} />;
}

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'acb:inline-flex acb:items-center acb:rounded-full acb:border acb:border-line acb:bg-surface-muted',
        'acb:px-2 acb:py-0.5 acb:text-xs acb:font-medium acb:text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}

export function ScrollArea({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <RadixScrollArea.Root className={cn('acb:overflow-hidden', className)}>
      <RadixScrollArea.Viewport className="acb:h-full acb:w-full">{children}</RadixScrollArea.Viewport>
      <RadixScrollArea.Scrollbar orientation="vertical" className="acb:flex acb:w-2 acb:touch-none acb:select-none">
        <RadixScrollArea.Thumb className="acb:flex-1 acb:rounded-full acb:bg-line" />
      </RadixScrollArea.Scrollbar>
    </RadixScrollArea.Root>
  );
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read out with the title. Required, so no dialog ships unlabelled. */
  description: string;
  children: ReactNode;
  /**
   * The control that opens it. Radix hands focus back to this element on
   * close, so a dialog opened from a button the caller renders separately
   * drops focus to the body instead.
   */
  trigger?: ReactNode;
  /** Where the portal renders. The widget passes its shadow root. */
  container?: HTMLElement | null;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, trigger, container, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal container={container ?? undefined}>
        <RadixDialog.Overlay className="acb:fixed acb:inset-0 acb:bg-black/40" />
        <RadixDialog.Content
          className={cn(
            'acb:fixed acb:right-0 acb:bottom-0 acb:flex acb:max-h-[85vh] acb:w-full acb:flex-col acb:gap-3',
            'acb:rounded-t-panel acb:border acb:border-line acb:bg-surface acb:p-4 acb:sm:right-4 acb:sm:bottom-4 acb:sm:w-96 acb:sm:rounded-panel',
            className,
          )}
        >
          <RadixDialog.Title className="acb:text-base acb:font-semibold acb:text-ink">{title}</RadixDialog.Title>
          <RadixDialog.Description className="acb:sr-only">{description}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
