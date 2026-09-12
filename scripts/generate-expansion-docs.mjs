import { readFile, writeFile } from 'node:fs/promises';
import { COMPETITIVE_RULES } from '../src/data/competitiveRules.ts';
import {
  EXPANSION_APPLICABILITY_MATRIX,
  EXPANSION_RULE_VERSION,
  EXPANSION_SUPPORT_ORDER,
  EXPANSION_SUPPORTS,
  EXPANSION_WEAPONS,
} from '../src/data/expansionCatalog.ts';

const root = new URL('../', import.meta.url);
const paths = {
  weapons: new URL('docs/WEAPON_CATALOG.md', root),
  supports: new URL('docs/SUPPORT_CATALOG.md', root),
  synergy: new URL('docs/SYNERGY_MATRIX.md', root),
  rules: new URL('docs/COMPETITIVE_RULES.md', root),
  balance: new URL('docs/BALANCE_REPORT.md', root),
};

const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
const statusLabel = (status) => status === 'implemented' ? '現行実装' : '設計済み・未実装';
const implementedWeaponCount = EXPANSION_WEAPONS.filter((weapon) => weapon.status === 'implemented').length;
const designOnlyWeaponCount = EXPANSION_WEAPONS.length - implementedWeaponCount;
const implementedSupportCount = EXPANSION_SUPPORTS.filter((support) => support.status === 'implemented').length;
const applicabilitySymbol = { direct: 'D', conditional: 'C', placement: 'P', 'not-applicable': '—' };

const supportSummary = (weapon) => {
  const groups = { direct: [], conditional: [], placement: [], 'not-applicable': [] };
  for (const [id, applicability] of Object.entries(weapon.supportProfile)) groups[applicability].push(id);
  const nonApplicable = groups['not-applicable'].map((id) => `${id}（${weapon.nonApplicableReasons[id]}）`);
  return [
    `直接: ${groups.direct.join('、') || 'なし'}`,
    `条件: ${groups.conditional.join('、') || 'なし'}`,
    `配置: ${groups.placement.join('、') || 'なし'}`,
    `非対応: ${nonApplicable.join('、') || 'なし'}`,
  ].join('<br>');
};

const weapons = `# 基本武器カタログ（V7実装正本）

ルール版：\`${EXPANSION_RULE_VERSION}\`。この台帳は、基本武器を分岐・レベル・進化・色違いと混同せず50種類で設計・実装するためのものです。現行で戦闘に登録されているのは「現行実装」の${implementedWeaponCount}件です。「設計済み・未実装」の${designOnlyWeaponCount}件は、本番の抽選・図鑑・公開レジストリへ出しません。各武器は抽選から到達できる登録と、個体別の攻撃経路・上限を持つことを検査します。

各行には、近い武器との差を2つ、通常成長、弱点、上限、補助の20組、相乗効果を2方向記載しています。相乗効果は数値倍率を2つ並べたものではなく、発動条件・代替経路・弱点を持つ構造として設計します。

| # | weaponId | 名称／短名 | 状態 | 制作群 | 主役割 | 最も近い武器 | 実戦上の差分 | 攻撃定義 | 成長・発展 | 得意でない場面 | 上限・停止条件 | 補助20組の区分 |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
${EXPANSION_WEAPONS.map((weapon, index) => `| ${index + 1} | \`${weapon.id}\` | ${escapeCell(weapon.name)}／${escapeCell(weapon.shortName)} | ${statusLabel(weapon.status)} | ${weapon.productionGroup} | ${escapeCell(weapon.role)} | ${escapeCell(weapon.closestWeapon)} | ${escapeCell(weapon.differences.join('／'))} | ${escapeCell(weapon.attack)} | ${escapeCell(weapon.growth)} | ${escapeCell(weapon.weakness)} | ${escapeCell(weapon.limits)} | ${supportSummary(weapon)} |`).join('\n')}

## 相乗効果の詳細

| weaponId | 方向 | 目的 | 発生源 | 成立条件 | 効果 | 代替できる供給元 | 弱点 | 検査ID |
|---|---|---|---|---|---|---|---|---|
${EXPANSION_WEAPONS.flatMap((weapon) => weapon.synergies.map((synergy, index) => `| \`${weapon.id}\` | ${index === 0 ? 'A' : 'B'} | ${escapeCell(synergy.purpose)} | ${escapeCell(synergy.source)} | ${escapeCell(synergy.trigger)} | ${escapeCell(synergy.effect)} | ${escapeCell(synergy.alternative)} | ${escapeCell(synergy.weakness)} | \`${synergy.testId}\` |`)).join('\n')}

## 数え方

- 設計数・実装登録数は50（既存8＋追加4＋V4追加13＋V5追加25）です。
- 分岐、通常レベル、特別発展は基本武器の中へ重複して数えません。
- 50件すべてに、攻撃経路・対象選択・発動条件・位置の意味・制約の組み合わせで、近い武器と異なる2つ以上の差分を記録しています。
- 実装状態、検査状態、公開受入状態は別に管理します。V7時点では実装済み${implementedWeaponCount}、公開受入済み0です。
`;

const supports = `# 補助カタログ（V7実装正本）

補助総数Sは **20** と決定します。既存6件だけでは、50武器へ攻撃変更・条件発動・接続・防衛・代償を分担させる台帳が不足するため14件を追加しました。V7時点で戦闘に登録されているのは${implementedSupportCount}件です。各補助は実効値の上限、非対応理由、接続条件を持ち、候補から到達できることを検査します。

| # | supportId | 名称 | 状態 | 役割 | 発動条件 | 効果 | 容量 | 上限・代償 | 記録する値 |
|---:|---|---|---|---|---|---|---|---|---|
${EXPANSION_SUPPORTS.map((support, index) => `| ${index + 1} | \`${support.id}\` | ${escapeCell(support.name)} | ${statusLabel(support.status)} | ${escapeCell(support.role)} | ${escapeCell(support.condition)} | ${escapeCell(support.effect)} | ${escapeCell(support.cost)} | ${escapeCell(support.limit)} | ${escapeCell(support.record)} |`).join('\n')}

## 適用区分

全50武器×20補助の1,000組を、次の4区分で扱います。非対応は不具合ではなく、攻撃方式に作用点がないことを明示した設計です。

| 記号 | 区分 | 意味 |
|---|---|---|
| D | 直接 | 補助の効果が通常攻撃へ直接働く |
| C | 条件 | 状態・対象・命中・耐久などの条件成立時だけ働く |
| P | 配置 | 接続図・設置場所・中継などの条件が必要 |
| — | 非対応 | この武器の攻撃方式に作用点がなく、候補へ出す理由がない |

同じ補助を2個置く場合は、加算後に個別上限を適用します。追加発動・中継・誘爆・触媒は派生世代と同一敵への回数を記録し、無限再帰や二重加点を許しません。
`;

const matrix = `# 武器×補助適用マトリクス（V7実装正本）

ルール版：\`${EXPANSION_RULE_VERSION}\`。行は基本武器50件、列は補助20件で、合計1,000セルです。値は「適用できるか」だけでなく、発動条件と上限を補助・武器の台帳へ分けて記録します。

記号：D＝直接、C＝条件、P＝配置、—＝非対応。非対応の理由は [WEAPON_CATALOG.md](WEAPON_CATALOG.md) の各行に記載しています。

| weaponId | ${EXPANSION_SUPPORT_ORDER.join(' | ')} |
|---|${EXPANSION_SUPPORT_ORDER.map(() => '---').join('|')}|
${EXPANSION_WEAPONS.map((weapon) => `| \`${weapon.id}\` | ${EXPANSION_SUPPORT_ORDER.map((supportId) => applicabilitySymbol[EXPANSION_APPLICABILITY_MATRIX[weapon.id][supportId]]).join(' | ')} |`).join('\n')}

## 検査の分け方

- C03：全1,000組で適用・非対応・上限を機械的に検査します。
- C04：各武器の相乗効果A/Bを成立・不成立・代替供給元・弱点・最大発動数まで検査します。
- C05：3装備以上の連動、反射、中継、誘爆、触媒が派生世代1と回数上限を守ることを検査します。
- C21：設計済みでも抽選条件が成立しない武器を到達不能として検出し、50完成から除外します。

V5では全50武器・全20補助を戦闘登録へ移し、個体・上限・候補到達を検査しました。V6では保存v3、途中復帰、結果精算、ゲーム側ランキング通信の準備を行いました。V7では最終ゲートとして本番BattleScene経路の長時間本戦を検査します。公開受入と本番ランキング有効化は別許可が必要です。
`;

const rules = `# 競技型無限モードのルール契約（V7ゲーム側準備済み／本番未接続）

この文書は、後続工程が同じ条件を参照するための設計契約です。\`${COMPETITIVE_RULES.version}\` は本番ランキングを有効化する識別子ではありません。V6でゲーム側の保存・結果・送信アダプターとmanifestを準備し、V7で最終ゲートの戦闘検査を追加しました。実験場の実際の登録、RPC署名・返り値・認証・権限は未確認です。既定値は未設定ゲートウェイで、本番データベースや実験場設定へ接続・変更しません。

## 共通の開始条件

| 項目 | V5引き継ぎ案 | 意味 |
|---|---:|---|
| コア耐久 | ${COMPETITIVE_RULES.initial.coreHp} | 全員が同じ初期耐久で始める |
| 基準威力 | ${COMPETITIVE_RULES.initial.baseDamage} | 研究購入量で変えない基準値 |
| 初期武器 | \`${COMPETITIVE_RULES.initial.initialWeapon}\` | 全員が同じ一つから始め、残りは戦闘中に抽選する |
| 初期武器枠 | ${COMPETITIVE_RULES.initial.installedWeaponSlots} | 最初に同時稼働できる武器個体数 |
| 初期補助枠 | ${COMPETITIVE_RULES.initial.installedSupportSlots} | 最初に同時稼働できる補助個体数 |
| 初期稼働容量 | ${COMPETITIVE_RULES.initial.capacity} | 武器・補助・発展が競合する試作値 |
| 引き直し | ${COMPETITIVE_RULES.initial.rerolls}回 | 全員共通。実質同一候補は回数を消費しない |
| 除外 | ${COMPETITIVE_RULES.initial.exclusions}回 | 範囲を明示して全員共通にする |

研究・通常ステージの解放・保存済みの武器解放は保持しますが、競技開始時の基礎能力・候補集合・引き直し・除外には適用しません。文字、音量、演出量など戦闘計算を変えない設定は使用できます。

## 候補抽選の重み

有効な候補集合を作り、以下の段階別重みで3枚を抽選します。重みは勝敗を均等化するための隠れ補正ではなく、候補の種類を偏らせないための公開データです。

| 候補の種類 | 重み |
|---|---:|
${Object.entries(COMPETITIVE_RULES.candidateWeights).map(([key, value]) => `| ${key} | ${value} |`).join('\n')}

レベル上限、前提、排他、空き枠、容量、同種上限、除外、実効値上限を確定前に再検証します。通常候補が1〜2枚ならそれを残し、不足分だけ継続候補で補います。完全に合法な特別発展がないとき、その名前だけを候補へ出しません。

## 得点・終了・同点

| 得点要素 | 係数 | 取り扱い |
|---|---:|---|
| 正規出現の敵を倒す | ${COMPETITIVE_RULES.score.kill} | 同じ敵の終端を一度だけ加点 |
| 危険段階の突破 | ${COMPETITIVE_RULES.score.threatTier} | 段階を一度だけ加点 |
| ボス突破 | ${COMPETITIVE_RULES.score.boss} | 同じボスを一度だけ加点 |
| 実際に達成した追加危険 | ${COMPETITIVE_RULES.score.challenge} | 選択だけでは加点しない |

生存時間と終了時HPは結果情報として保存しますが、待機や終了直前の回復を主な得点源にしません（\`timeAndHpAreResultFields=${COMPETITIVE_RULES.score.timeAndHpAreResultFields}\`）。敗北、記録確定終了、中断、破棄、試験結果を分け、V6で受付契約へ対応付けます。V7ではこの方針をBattleSceneの競技スコアへ適用し、整数の有限範囲と同点順序は最終公開前に変更記録へ固定します。

## 乱数と競技資格

乱数は ${COMPETITIVE_RULES.seedStreams.map((stream) => `\`${stream}\``).join('、')} に分けます。無効入力、画面再表示、演出設定、同一候補の引き直し失敗は、敵やボスの乱数を進めません。同じ開始条件・抽選規則で競いますが、全員へ同じ引きを配る固定シード競争へは変更しません。

競技資格は次のとおりです。

${COMPETITIVE_RULES.qualification.map((item) => `- ${item}`).join('\n')}

## V7のゲーム側境界

V7のゲーム側は、開始再送用の\`start_id\`、受付が発行する\`play_id\`、結果送信用の一つの\`submission_id\`、finish→submitの順序、応答喪失後の同一内容再送、idle／submitting／submitted／retryable_failed／permanent_failedを実装しています。結果・精算台帳は一つの\`resultId\`を一回だけ反映し、リタイアをランキング対象へ送りません。\`ranking-manifest.json\`の正式URL・game_id・版・採点順序を検証します。V7の最終ゲートでは、競技スコアへ生存時間・残HPを加算せず、通常モードの旧式得点とはルール版を分離します。

実際のSupabase／実験場の受付、登録値、認証、権限、iPhone Safari、公開配備の一致は未確認であり、ユーザーの別許可なしに有効化しません。採点係数はV1の比較案を出発点とし、V4以後の本戦データで変更する場合は旧値・新値・理由・版を残します。
`;

const balance = `# V7へ引き継いだ設計判断と未測定範囲

V1で定めた基本50武器・補助S・相乗効果・競技条件をV7へ引き継ぎました。V5でruntime登録されたこと、V6でゲーム側の保存・結果・送信準備ができたこと、V7で最終ゲートを検査したことと、バランス・競技受入・本番連携が完了したことを混同しません。

## 決定表

| ID | 引き継いだ判断 | 根拠 | 後続で測ること |
|---|---|---|---|
| D01 | 基本50（既存8＋追加4＋V4追加13＋V5追加25）、補助S=20 | 役割の重複比較と50×20の適用表を同時に埋め、名前だけの登録を防ぐ | 抽選到達・実戦相乗効果・重複監査 |
| D02 | 通常Lv8、Lv3/Lv5分岐、Lv8特別発展を共通の出発点にする | 通常成長だけでも価値を残し、発展を特定補助の当選に依存させない | V3以後の成長間隔・同時発展数・派生上限 |
| D03 | 初期容量6、武器3枠・補助3枠、拡張は候補から選ぶ | 18枠を全て最大化することと設置場所を増やすことを分離する | V2/V3の容量不足・万能化・選択不能 |
| D04 | 新規武器3、既存成長5、補助4、拡張2、特別1、継続1 | 有効候補を残し、登録数の多い種類だけが占有しない | V7の提示率、停滞、引き直し、方針別分布 |
| D05 | 撃破10、危険段階100、ボス1,000、追加危険250 | 生存秒・残HPを主得点にせず、実際の対処を一度だけ評価する | V7の稼ぎ行動、同点、整数範囲、終了種別 |
| D06 | 予告0.9秒以上、敵・弾・派生の共通上限、5分節目 | 見えない即死と無制限増殖を避け、局面差を作る | 各敵の撃破時間、経験値、危険段階、負荷 |
| D07 | ルール版・play_id・submission_idを分け、ゲーム側は既定未接続で再送契約を準備 | 文書上の契約名と本番の実署名を混同しない | V7の実験場受付、再送、版拒否、上位再計算 |

## まだ測っていないこと

- 50武器を実戦へ追加した後の撃破時間、取得率、弱点、処理負荷はV7の代表・全件検査で観測しますが、長期のバランス結論は未確定です。
- 20補助の実効値、1,000組の長時間相乗効果、容量による選択差は未測定です。
- 通常720試行、競技無限60試行、30/60/120回描画比較はV7の自動最終ゲート対象です。iPhone Safari実機は未確認です。
- 採用案は設計契約であり、実測で変更する場合はルール版を分け、既存記録を上書きしません。

## 受入条件

V7では、V5の内容実装とV6の保存・結果・ゲーム側ランキング準備に加えて、通常720試行、競技無限60試行、30/60/120回描画一致の最終ゲートを本番BattleScene経路で提出します。これだけでiPhone Safari、本番ランキングが公開された、バランスが完成したとは報告しません。競技ルール版はV7へ更新し、V6途中状態は版不一致として黙って再開しません。
`;

const output = new Map([
  [paths.weapons, weapons],
  [paths.supports, supports],
  [paths.synergy, matrix],
  [paths.rules, rules],
  [paths.balance, balance],
]);

const check = process.argv.includes('--check');
const mismatches = [];
for (const [url, content] of output) {
  if (check) {
    let current;
    try { current = await readFile(url, 'utf8'); }
    catch { current = null; }
    if (current !== content) mismatches.push(url.pathname);
  } else {
    await writeFile(url, content, 'utf8');
  }
}

if (mismatches.length > 0) {
  console.error(`生成結果と一致しない文書: ${mismatches.join(', ')}`);
  process.exitCode = 1;
} else if (check) {
  console.log('V7拡張文書を確認しました（5ファイル）。');
} else {
  console.log('V7拡張文書を生成しました（5ファイル）。');
}
