/**
 * Puts a stylesheet inside a shadow root and nowhere else.
 *
 * Constructable stylesheets are the cheap path, but `new CSSStyleSheet()` is
 * missing in jsdom and in older Safari, so a `<style>` element appended to the
 * same shadow root is the fallback. Both stay inside the root: the widget never
 * writes to `document.head`, because that would be a change to a page this
 * project does not own.
 */
export function adoptStyles(shadow: ShadowRoot, css: string): void {
  try {
    const adopted = shadow.adoptedStyleSheets;
    if (Array.isArray(adopted)) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [...adopted, sheet];
      return;
    }
  } catch {
    // No constructable stylesheets here, so fall through to an element.
  }
  const style = shadow.ownerDocument.createElement('style');
  style.textContent = css;
  shadow.append(style);
}
