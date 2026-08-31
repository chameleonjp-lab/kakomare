export type AppView =
  | 'boot'
  | 'name-entry'
  | 'home'
  | 'stage-select'
  | 'research'
  | 'countdown'
  | 'battle'
  | 'result'
  | 'settings'
  | 'rules';

export const VIEW_LABELS: Record<AppView, string> = {
  boot: '起動',
  'name-entry': '名前入力',
  home: 'ホーム',
  'stage-select': 'ステージ選択',
  research: '研究と記録',
  countdown: '開始準備',
  battle: '戦闘',
  result: '結果',
  settings: '設定',
  rules: '遊び方',
};
