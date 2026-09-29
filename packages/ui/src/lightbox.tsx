/**
 * An image, or anything else, opened full size over the page.
 *
 * It is a Radix dialog like `Dialog`, but centered and near full screen rather
 * than docked in a corner as the chat panel is. Only the landing page uses it,
 * which owns its document, so the modal's scroll lock on `document.body` is
 * fine here in a way it would not be inside the widget.
 *
 * Escape, a click outside the content and the close button all dismiss it,
 * and focus returns to the trigger.
 */
import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface LightboxProps {
  /** The control that opens it. Focus comes back here on close. */
  trigger: ReactNode;
  /** Read out when it opens, and not shown. */
  title: string;
  children: ReactNode;
  className?: string;
}

export function Lightbox({ trigger, title, children, className }: LightboxProps) {
  return (
    <RadixDialog.Root>
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="acb:fixed acb:inset-0 acb:z-40 acb:bg-black/75" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn(
            'acb:fixed acb:inset-4 acb:z-50 acb:flex acb:items-center acb:justify-center acb:sm:inset-8',
            'acb:focus-visible:outline-none',
            className,
          )}
        >
          <RadixDialog.Title className="acb:sr-only">{title}</RadixDialog.Title>
          {children}
          <RadixDialog.Close
            aria-label="Close"
            className={cn(
              'acb:absolute acb:top-0 acb:right-0 acb:inline-flex acb:h-10 acb:w-10 acb:items-center acb:justify-center',
              'acb:rounded-full acb:bg-surface acb:text-ink acb:shadow acb:hover:bg-surface-muted',
              'acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent',
            )}
          >
            <X aria-hidden="true" className="acb:size-5" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
