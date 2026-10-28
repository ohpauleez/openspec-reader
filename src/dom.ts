import DOMPurify from 'dompurify';

/** Construct controls using textContent; caller-supplied strings never become markup. */
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Return a type=button control with an accessible text label. */
export function button(text: string, action: () => void, title = text): HTMLButtonElement {
  const node = element('button', '', text);
  node.type = 'button';
  node.title = title;
  node.addEventListener('click', action);
  return node;
}

/** Sanitize all Markdown HTML and strip document IDs so controls/heading IDs cannot be shadowed. */
export function markdownFragment(html: string): DocumentFragment {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true, USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'textarea', 'button', 'select', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['id', 'name', 'style'], ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['data-osr-fence'],
  });
  for (const input of fragment.querySelectorAll('input')) {
    if (input.type !== 'checkbox') input.remove();
    else input.disabled = true;
  }
  for (const link of fragment.querySelectorAll('a[target="_blank"]')) link.setAttribute('rel', 'noopener noreferrer');
  return fragment;
}

/** Reveal all ancestor sections before focusing a heading, diagnostic, or search match. */
export function reveal(target: HTMLElement): void {
  for (let parent: HTMLElement | null = target; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
  target.classList.remove('osr-flash');
  requestAnimationFrame(() => target.classList.add('osr-flash'));
}
