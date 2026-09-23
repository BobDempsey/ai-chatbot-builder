/**
 * What these prove, in the order the task list asks for them:
 *
 * - React 19 takes `ref` as a plain prop, and the Radix dialog still moves
 *   focus in and hands it back, with no `forwardRef` wrapper anywhere.
 * - An answer's markdown renders, a wide table sits in its own focusable
 *   scroll region, raw HTML is dropped, and axe finds nothing.
 * - One component renders under two bot themes.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Answer } from './answer';
import { Button, Dialog, Input } from './primitives';
import { readableInk, themeStyle } from './theme';

afterEach(cleanup);

const TABLE = `Here is the comparison.

| Library | Size |
| --- | ---: |
| Alpha | 12 KB |
| Beta | 34 KB |
`;

describe('React 19 refs and focus', () => {
  it('takes ref as a plain prop, with no forwardRef wrapper', () => {
    function Probe() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <>
          <Input ref={ref} aria-label="Question" />
          <Button onClick={() => ref.current?.focus()}>Focus it</Button>
        </>
      );
    }
    render(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus it' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Question'));
  });

  it('moves focus into the dialog and returns it to the trigger', async () => {
    function Probe() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Chat"
          description="Ask the bot a question."
          trigger={<Button>Open chat</Button>}
        >
          <Input aria-label="Message" />
        </Dialog>
      );
    }
    render(<Probe />);
    const trigger = screen.getByRole('button', { name: 'Open chat' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('touches neither document.body nor document.head when it is not modal', async () => {
    function Probe() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          modal={false}
          title="Chat"
          description="Ask the bot a question."
          trigger={<Button>Open chat</Button>}
        >
          <Input aria-label="Message" />
        </Dialog>
      );
    }
    const headBefore = document.head.innerHTML;
    render(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    await screen.findByRole('dialog');

    // The widget mounts on pages this project does not own, so a scroll lock
    // written onto the host's body is a change to somebody else's document.
    expect(document.body.getAttribute('style')).toBeFalsy();
    expect(document.head.innerHTML).toBe(headBefore);
  });
});

describe('answer rendering', () => {
  it('puts a table in its own focusable scroll region', () => {
    render(<Answer text={TABLE} />);
    const region = screen.getByRole('region', { name: 'Table' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('acb:overflow-x-auto');
    expect(region.querySelector('table')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Library' })).toBeTruthy();
  });

  it('drops raw HTML rather than rendering it', () => {
    const { container } = render(<Answer text={'Careful <script>alert(1)</script> now'} />);
    expect(container.querySelector('script')).toBeNull();
  });

  it('lists citations as buttons once streaming is done', () => {
    const citation = {
      index: 1,
      documentId: '00000000-0000-4000-8000-000000000001',
      documentTitle: 'Refund policy',
      section: 'Within 30 days',
      chunkId: '00000000-0000-4000-8000-000000000002',
    };
    const { rerender } = render(<Answer text="You have 30 days. [1]" citations={[citation]} pending />);
    expect(screen.queryByText('Sources')).toBeNull();

    rerender(<Answer text="You have 30 days. [1]" citations={[citation]} />);
    expect(screen.getByRole('button', { name: /Refund policy/ })).toBeTruthy();
  });

  it('passes axe with an answer, citations and a table on screen', async () => {
    const { container } = render(
      <Answer
        text={TABLE}
        citations={[
          {
            index: 1,
            documentId: '00000000-0000-4000-8000-000000000001',
            documentTitle: 'Bundle sizes',
            section: 'Results',
            chunkId: '00000000-0000-4000-8000-000000000002',
          },
        ]}
      />,
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('theming', () => {
  it('renders one component under two bot themes', () => {
    const { container: light } = render(
      <div style={themeStyle({ accentColor: '#2563eb' })}>
        <Button>Send</Button>
      </div>,
    );
    const { container: warm } = render(
      <div style={themeStyle({ accentColor: '#facc15' })}>
        <Button>Send</Button>
      </div>,
    );
    expect((light.firstChild as HTMLElement).style.getPropertyValue('--acb-color-accent')).toBe('#2563eb');
    expect((warm.firstChild as HTMLElement).style.getPropertyValue('--acb-color-accent')).toBe('#facc15');
  });

  it('picks ink a reader can see against the accent', () => {
    expect(readableInk('#2563eb')).toBe('#ffffff');
    expect(readableInk('#facc15')).toBe('#16181d');
  });
});
