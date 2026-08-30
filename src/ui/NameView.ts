import { button, element, heading, pageShell } from './viewUtils';

export function createNameView(onSubmit: (name: string) => void): HTMLElement {
  const shell = pageShell('カコマレ', '名前を決めると、端末内に進行と記録を保存できます。');
  const card = element('div', 'name-card card');
  card.append(heading('プレイヤー名', 2));
  const label = element('label', 'field-label', '1〜12文字');
  const input = element('input', 'name-input') as HTMLInputElement;
  input.type = 'text';
  input.name = 'player-name';
  input.setAttribute('autocomplete', 'nickname');
  input.maxLength = 12;
  input.placeholder = '名前を入力';
  input.setAttribute('aria-describedby', 'name-help name-error');
  const help = element('p', 'field-help', '前後の空白は取り除きます。外部へ送信しません。');
  help.id = 'name-help';
  const error = element('p', 'form-error');
  error.id = 'name-error';
  error.setAttribute('role', 'alert');
  const start = button('この名前で始める', 'button button-primary button-large');
  const submit = (): void => {
    const value = input.value.trim();
    const hasControl = [...value].some((char) => { const code = char.codePointAt(0) ?? 0; return code <= 0x1f || code === 0x7f; });
    if (!value || hasControl || [...value].length > 12) {
      error.textContent = '1〜12文字で入力してください。';
      input.focus();
      return;
    }
    onSubmit(value);
  };
  start.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  card.append(label, input, help, error, start);
  shell.append(card);
  return shell;
}
