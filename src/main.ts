import './styles/base.css';
import './styles/layout.css';
import './styles/game.css';
import { AppController } from './app/AppController';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('アプリの表示領域が見つかりません。');
}

const controller = new AppController(root);
void controller.start();
