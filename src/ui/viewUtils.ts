export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function button(label: string, className = 'button button-secondary'): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  return node;
}

export function heading(text: string, level: 1 | 2 | 3 = 2): HTMLHeadingElement {
  const node = element(`h${level}` as 'h1', '', text);
  return node;
}

export function card(className = 'card'): HTMLDivElement {
  return element('div', className);
}

export function isValidPlayerName(value: string): boolean {
  const name = value.trim();
  if ([...name].length < 1 || [...name].length > 12) return false;
  return ![...name].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

export function pageShell(title: string, description = ''): HTMLElement {
  const shell = element('section', 'page-shell');
  shell.append(heading(title, 1));
  if (description) shell.append(element('p', 'page-description', description));
  return shell;
}
