/**
 * The split point. The entry script imports this module and nothing else from
 * the chat half, so React, the shared components and the prefixed stylesheet
 * all land in one chunk that a page nobody uses never fetches.
 *
 * The stylesheet is adopted into the same shadow root the bubble already lives
 * in, so it arrives late without ever touching the host page.
 */
import { createRoot } from 'react-dom/client';
import { adoptStyles } from '../adopt-styles';
import { ChatPanel } from './panel';
import styles from '../styles.css?inline';

export interface MountChatArgs {
  shadow: ShadowRoot;
  /** The node the entry drew the bubble into. React takes it over. */
  root: HTMLElement;
  botId: string;
  apiBase: string;
  /** Sent as the first message when it is not empty. */
  question: string;
}

export type MountChat = (args: MountChatArgs) => () => void;

export const mountChat: MountChat = ({ shadow, root, botId, apiBase, question }) => {
  adoptStyles(shadow, styles);
  const reactRoot = createRoot(root);
  reactRoot.render(<ChatPanel botId={botId} apiBase={apiBase} initialOpen initialQuestion={question} />);
  return () => reactRoot.unmount();
};
