/**
 * The whole payload of the one-line script tag:
 *
 *   <script type="module" src="https://<host>/embed.js" data-acb-bot="<publicId>"></script>
 *
 * It attaches a shadow root, draws a bubble, and stops. React, the shared
 * components and the prefixed stylesheet live in a second chunk that downloads
 * when a visitor first hovers, focuses or clicks the bubble, so a page nobody
 * uses pays for this file alone. ai-frontend-advisor's `site/src/chat/main.ts`
 * is where the pattern comes from.
 *
 * Two details are deliberate. The bot is named by its public id, not by a
 * cookie, because a third-party page never sends ours. And a failed download
 * leaves the bubble clickable for another try rather than reloading the host
 * page, which is not ours to reload.
 *
 * `data-acb-api` overrides where requests go; without it they go to the origin
 * that served this script.
 */
import { BOT_ID_ATTRIBUTE, THEME_ATTRIBUTE } from '@acb/schemas/embed';
import { adoptStyles } from './adopt-styles';
import { ASK_EVENT, askWidget, questionOf } from './ask-event';
import { BUBBLE_CSS, createBubbleButton } from './bubble';
import type { MountChat } from './chat/island';

export { ASK_EVENT, askWidget } from './ask-event';
export type { MountChat, MountChatArgs } from './chat/island';

export interface WidgetOptions {
  /** The bot's public id. It grants asking questions and nothing else. */
  botId: string;
  /** Where `/api/...` lives. Empty means the page's own origin. */
  apiBase?: string;
  /** Where the host element goes. The document body unless a test says otherwise. */
  container?: HTMLElement;
  /** Swapped in tests, so a suite can count downloads and force one to fail. */
  loadChat?: () => Promise<{ mountChat: MountChat }>;
}

export interface WidgetHandle {
  /** The element added to the page. Everything else lives in its shadow root. */
  host: HTMLElement;
  shadow: ShadowRoot;
  /** Opens the chat, sending `question` as the first message when it is set. */
  open: (question?: string) => void;
  /** True once the chat bundle has been asked for. */
  requested: () => boolean;
  destroy: () => void;
}

export function createWidget(options: WidgetOptions): WidgetHandle {
  const { botId, apiBase = '', container = document.body } = options;
  const loadChat = options.loadChat ?? (() => import('./chat/island'));

  const host = document.createElement('div');
  host.setAttribute('data-acb-widget', '');
  container.append(host);

  // The dark tokens inside the shadow root key on this attribute, copied from
  // the host page's <html>. Only this project's own pages set it, through the
  // theme toggle, so a customer's page keeps a light widget.
  const syncTheme = () => {
    const theme = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    if (theme) host.setAttribute(THEME_ATTRIBUTE, theme);
    else host.removeAttribute(THEME_ATTRIBUTE);
  };
  syncTheme();
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });

  const shadow = host.attachShadow({ mode: 'open' });
  adoptStyles(shadow, BUBBLE_CSS);

  const root = document.createElement('div');
  root.className = 'acb-root';
  shadow.append(root);

  const bubble = createBubbleButton();
  root.append(bubble);

  let loading: Promise<{ mountChat: MountChat }> | undefined;
  let requested = false;
  let mounted = false;
  let unmount: (() => void) | undefined;

  const load = () => {
    requested = true;
    loading ??= loadChat();
    return loading;
  };

  const open = (question = '') => {
    if (mounted) {
      askWidget(question);
      return;
    }
    mounted = true;
    bubble.setAttribute('aria-busy', 'true');
    load()
      .then(({ mountChat }) => {
        // React takes over the same node, so its bubble replaces this one and
        // becomes the element focus returns to when the panel closes.
        unmount = mountChat({ shadow, root, botId, apiBase, question });
      })
      .catch(() => {
        // The download failed. Clear everything the next click needs, so the
        // bubble tries again instead of sitting dead.
        bubble.removeAttribute('aria-busy');
        loading = undefined;
        mounted = false;
      });
  };

  const onAsk = (event: Event) => {
    if (mounted) return;
    open(questionOf(event));
  };

  bubble.addEventListener('pointerenter', () => void load(), { once: true });
  bubble.addEventListener('focus', () => void load(), { once: true });
  bubble.addEventListener('click', () => open());
  window.addEventListener(ASK_EVENT, onAsk);

  return {
    host,
    shadow,
    open,
    requested: () => requested,
    destroy: () => {
      window.removeEventListener(ASK_EVENT, onAsk);
      themeObserver.disconnect();
      unmount?.();
      host.remove();
    },
  };
}

/**
 * The script tag path. Importing this module from the landing page finds no
 * such tag and mounts nothing, so that page can call `createWidget` itself.
 */
function mountFromScriptTag(): void {
  const tag = document.querySelector<HTMLScriptElement>(`script[${BOT_ID_ATTRIBUTE}]`);
  const botId = tag?.dataset.acbBot;
  if (!tag || !botId) return;
  const apiBase = tag.dataset.acbApi ?? '';
  createWidget({ botId, apiBase });
}

if (typeof document !== 'undefined') mountFromScriptTag();
