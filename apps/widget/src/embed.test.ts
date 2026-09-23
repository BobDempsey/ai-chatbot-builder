/**
 * What the entry script promises a host page, checked against a page that is
 * doing its best to break it:
 *
 * - the widget lives in a shadow root and its styles go in there with it,
 * - the page itself is left exactly as it was found, and
 * - the chat bundle is fetched on first reach, never before, and a failed
 *   fetch leaves the bubble clickable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASK_EVENT } from './ask-event';
import { BUBBLE_CLASS } from './bubble';
import type { MountChat } from './chat/island';
import { createWidget, type WidgetHandle } from './embed';

const BOT_ID = '00000000-0000-4000-8000-000000000041';

/** A host page with a universal reset, a universal font and a loud opinion. */
const HOSTILE_CSS = `
  * { box-sizing: content-box !important; font-family: 'Comic Sans MS' !important; color: #b91c1c !important; }
  button, div, p { border: 3px dashed #7c3aed !important; background: #ecfccb !important; }
`;

function dressTheHostPage(): { head: number; body: string } {
  const style = document.createElement('style');
  style.id = 'host-styles';
  style.textContent = HOSTILE_CSS;
  document.head.append(style);
  document.body.innerHTML = '<h1>Somebody else\'s website</h1><button type="button" id="host-button">Theirs</button>';
  return { head: document.head.childElementCount, body: document.body.innerHTML };
}

/** A chat bundle that records how often it was asked for and what it was given. */
function fakeChatModule() {
  const mountChat = vi.fn<MountChat>(() => () => {});
  const load = vi.fn(async () => ({ mountChat }));
  return { mountChat, load };
}

let widget: WidgetHandle | undefined;

afterEach(() => {
  widget?.destroy();
  widget = undefined;
  document.head.querySelector('#host-styles')?.remove();
  document.body.innerHTML = '';
});

describe('mounting on a page the widget does not own', () => {
  it('renders the bubble inside a shadow root with its styles in that root', () => {
    dressTheHostPage();
    const { load } = fakeChatModule();
    widget = createWidget({ botId: BOT_ID, loadChat: load });

    expect(widget.host.shadowRoot).toBe(widget.shadow);
    const bubble = widget.shadow.querySelector(`.${BUBBLE_CLASS}`);
    expect(bubble).toBeTruthy();
    expect(bubble?.getAttribute('aria-label')).toBe('Open the chat');

    // Either constructable stylesheets or the `<style>` fallback, but in the
    // shadow root either way.
    const inRoot = (widget.shadow.adoptedStyleSheets?.length ?? 0) > 0 || widget.shadow.querySelector('style') !== null;
    expect(inRoot).toBe(true);
  });

  it('leaves the markup and stylesheets of the host page untouched', () => {
    const before = dressTheHostPage();
    const { load } = fakeChatModule();
    const hostButton = document.getElementById('host-button') as HTMLElement;
    const theirBorder = getComputedStyle(hostButton).border;

    widget = createWidget({ botId: BOT_ID, loadChat: load });

    // Nothing new in the head, so no global stylesheet and no reset.
    expect(document.head.childElementCount).toBe(before.head);
    expect(document.querySelectorAll('head style, head link').length).toBe(1);
    // The body gained one element, the widget's own, and lost nothing.
    expect(document.body.innerHTML.startsWith(before.body)).toBe(true);
    expect(document.body.getAttribute('style')).toBeNull();
    expect(document.body.className).toBe('');
    expect(getComputedStyle(hostButton).border).toBe(theirBorder);
  });
});

describe('the chat bundle downloads on first reach', () => {
  it('is never requested by a page nobody interacts with', () => {
    const { load } = fakeChatModule();
    widget = createWidget({ botId: BOT_ID, loadChat: load });
    expect(load).not.toHaveBeenCalled();
    expect(widget.requested()).toBe(false);
  });

  it('starts downloading on hover and mounts on the click that follows', async () => {
    const { load, mountChat } = fakeChatModule();
    widget = createWidget({ botId: BOT_ID, loadChat: load });
    const bubble = widget.shadow.querySelector(`.${BUBBLE_CLASS}`) as HTMLButtonElement;

    bubble.dispatchEvent(new Event('pointerenter'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(mountChat).not.toHaveBeenCalled();

    bubble.click();
    await vi.waitFor(() => expect(mountChat).toHaveBeenCalledTimes(1));
    // One download served both the hover and the click.
    expect(load).toHaveBeenCalledTimes(1);
    expect(mountChat.mock.calls[0]?.[0]).toMatchObject({ botId: BOT_ID, question: '' });
  });

  it('starts downloading when the bubble takes focus', () => {
    const { load } = fakeChatModule();
    widget = createWidget({ botId: BOT_ID, loadChat: load });
    const bubble = widget.shadow.querySelector(`.${BUBBLE_CLASS}`) as HTMLButtonElement;
    bubble.dispatchEvent(new Event('focus'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('leaves the bubble clickable when the download fails', async () => {
    const mountChat = vi.fn<MountChat>(() => () => {});
    const load = vi
      .fn<() => Promise<{ mountChat: MountChat }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ mountChat });
    widget = createWidget({ botId: BOT_ID, loadChat: load });
    const bubble = widget.shadow.querySelector(`.${BUBBLE_CLASS}`) as HTMLButtonElement;

    bubble.click();
    await vi.waitFor(() => expect(bubble.hasAttribute('aria-busy')).toBe(false));
    expect(mountChat).not.toHaveBeenCalled();
    expect(bubble.isConnected).toBe(true);

    bubble.click();
    await vi.waitFor(() => expect(mountChat).toHaveBeenCalledTimes(1));
  });
});

describe('a question handed in by the page', () => {
  it('opens the chat with that question already sent', async () => {
    const { load, mountChat } = fakeChatModule();
    widget = createWidget({ botId: BOT_ID, loadChat: load });

    window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question: '  How do refunds work?  ' } }));

    await vi.waitFor(() => expect(mountChat).toHaveBeenCalledTimes(1));
    expect(mountChat.mock.calls[0]?.[0]).toMatchObject({ question: 'How do refunds work?' });
  });
});

describe('the theme', () => {
  afterEach(() => document.documentElement.removeAttribute('data-acb-theme'));

  it('stays light on a page that never sets one', () => {
    widget = createWidget({ botId: BOT_ID, loadChat: fakeChatModule().load });
    expect(widget.host.hasAttribute('data-acb-theme')).toBe(false);
  });

  it("follows this project's toggle on the host page's <html>", async () => {
    document.documentElement.setAttribute('data-acb-theme', 'dark');
    widget = createWidget({ botId: BOT_ID, loadChat: fakeChatModule().load });
    expect(widget.host.getAttribute('data-acb-theme')).toBe('dark');

    document.documentElement.setAttribute('data-acb-theme', 'light');
    await Promise.resolve();
    expect(widget.host.getAttribute('data-acb-theme')).toBe('light');
  });
});
