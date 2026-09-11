# 武器×補助適用マトリクス（V1設計正本）

ルール版：`expansion-v4-runtime`。行は基本武器50件、列は補助20件で、合計1,000セルです。値は「適用できるか」だけでなく、発動条件と上限を補助・武器の台帳へ分けて記録します。

記号：D＝直接、C＝条件、P＝配置、—＝非対応。非対応の理由は [WEAPON_CATALOG.md](WEAPON_CATALOG.md) の各行に記載しています。

| weaponId | output | rhythm | branch | focus | observe | brake | relay | repair | shatter | conductive | ignite | brink | anchor | veil | vector | pulse | reserve | lattice | orbit | catalyst |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `needle` | D | D | C | D | C | C | P | C | C | C | C | C | C | — | D | C | C | — | — | C |
| `ray` | D | D | C | C | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `cluster` | D | C | C | D | C | C | P | C | C | C | C | C | C | — | C | C | C | C | — | C |
| `repulse` | D | C | C | C | C | D | — | C | C | C | C | C | C | D | — | C | C | C | C | C |
| `chain` | D | D | C | D | C | C | P | — | C | D | C | C | C | — | C | C | C | C | — | D |
| `orbit` | D | C | C | C | C | D | — | — | C | C | C | C | C | C | C | C | C | — | D | C |
| `disc` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `gravity` | C | C | C | C | C | D | P | C | C | C | C | C | D | C | — | C | C | — | C | C |
| `grid` | C | C | C | C | C | D | — | — | C | C | C | C | C | C | D | C | C | D | — | C |
| `mine` | C | C | C | C | C | D | P | C | C | C | C | C | D | — | C | C | C | — | P | C |
| `lance` | D | C | C | D | C | C | P | — | C | C | C | C | C | — | C | C | D | C | — | C |
| `drone` | D | D | C | C | C | C | — | C | C | C | C | C | C | — | D | C | C | — | C | C |
| `fan` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | C | C | C | — | C | C |
| `beacon` | D | D | C | D | C | C | P | C | C | C | C | C | C | — | D | C | C | — | — | C |
| `swell` | D | C | C | D | C | C | P | C | C | C | C | C | C | — | C | C | C | C | — | C |
| `seeker` | D | D | C | C | C | C | — | C | C | C | C | C | C | — | D | C | C | — | C | C |
| `flare` | D | C | C | C | C | D | P | C | C | C | C | C | D | D | — | C | C | C | P | C |
| `shockwave` | D | C | C | C | C | D | P | C | C | C | C | C | D | D | — | C | C | C | P | C |
| `prism` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `anchor` | C | C | C | C | C | D | P | C | C | C | C | C | D | C | — | C | C | — | C | C |
| `ribbon` | D | D | C | C | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `barrage` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | C | C | C | — | C | C |
| `drill` | D | D | C | D | C | C | P | C | C | C | C | C | C | — | D | C | C | — | — | C |
| `mortar` | D | C | C | D | C | C | P | C | C | C | C | C | C | — | C | C | C | C | — | C |
| `mist` | D | C | C | C | C | D | P | C | C | C | C | C | D | D | — | C | C | C | P | C |
| `spark` | D | D | C | D | C | C | P | — | C | D | C | C | C | — | C | C | C | C | — | D |
| `coil` | D | D | C | C | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `bloom` | D | C | C | D | C | C | P | C | C | C | C | C | C | — | C | C | C | C | — | C |
| `shuttle` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `siphon` | D | C | C | C | C | D | P | — | C | D | C | C | C | — | C | C | C | C | C | D |
| `mirror` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `stasis` | C | C | C | C | C | D | P | C | C | C | C | C | D | C | — | C | C | — | C | C |
| `quake` | D | C | C | C | C | D | — | C | C | C | C | C | C | D | — | C | C | C | C | C |
| `spoke` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | C | C | C | — | C | C |
| `cutter` | D | C | C | C | C | D | — | — | C | C | C | C | C | C | C | C | C | — | D | C |
| `nova` | D | C | C | D | C | C | P | — | C | C | C | C | C | — | C | C | D | C | — | C |
| `ward` | D | C | C | C | C | D | — | C | C | C | C | C | C | D | — | C | C | C | C | C |
| `harpoon` | C | C | C | C | C | D | P | C | C | C | C | C | D | C | — | C | C | — | C | C |
| `vortex` | C | C | C | C | C | D | P | C | C | C | C | C | D | C | — | C | C | — | C | C |
| `hollow` | D | D | C | C | C | C | P | — | C | C | C | C | C | — | D | C | C | C | — | C |
| `snare` | C | C | C | C | C | D | P | C | C | C | C | C | D | — | C | C | C | — | P | C |
| `chime` | D | C | C | C | C | D | P | — | C | D | C | C | C | — | C | C | C | C | C | D |
| `thunder` | D | C | C | D | C | C | P | C | C | C | C | C | C | — | C | C | C | C | — | C |
| `frost` | D | C | C | C | C | D | P | C | C | C | C | C | D | D | — | C | C | C | P | C |
| `swarm` | D | D | C | C | C | C | — | C | C | C | C | C | C | — | D | C | C | — | C | C |
| `counter` | C | C | C | C | C | D | — | — | C | C | C | C | C | C | D | C | C | D | — | C |
| `dive` | D | D | C | D | C | C | P | C | C | C | C | C | C | — | D | C | C | — | — | C |
| `axis` | D | D | C | D | C | C | P | — | C | C | C | C | C | — | C | C | C | — | C | C |
| `seed` | D | D | C | D | C | C | P | C | C | C | C | C | C | D | — | C | C | D | P | C |
| `requiem` | D | C | C | D | C | C | P | — | C | C | C | C | C | — | C | C | D | C | — | C |

## 検査の分け方

- C03：全1,000組で適用・非対応・上限を機械的に検査します。
- C04：各武器の相乗効果A/Bを成立・不成立・代替供給元・弱点・最大発動数まで検査します。
- C05：3装備以上の連動、反射、中継、誘爆、触媒が派生世代1と回数上限を守ることを検査します。
- C21：設計済みでも抽選条件が成立しない武器を到達不能として検出し、50完成から除外します。

V1では設計と検証器を提出します。戦闘への追加実装、容量実測、全50の抽選到達、長時間本戦はV2〜V7で行います。
