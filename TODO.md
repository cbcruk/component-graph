# TODO — 브리프 밖 후보

브리프(Phase 1·2, Task 1–4)는 모두 구현 완료. 아래는 **브리프 범위 밖**의 확장 후보다.
착수 전 필요성/설계를 확인할 것 — 무거운 추상화·research 늪 금지 원칙은 그대로 유지.

## 우선순위 높음 — op를 실제로 쓸 수 있게

- [ ] **편집 디스크 적용** — `extractComponent`의 `TextEdit[]`를 파일에 실제 반영하는 `applyEdits(file)`.
      fail-closed·atomic 유지 (임시 파일 → rename, 실패 시 원본 불변). `hash`로 stale 재확인.
- [ ] **cgraph CLI** — `cgraph extract <file> --component <Name> --line <N> --name <New> [--write]`.
      `--write` 없으면 diff/미리보기만 (dry-run 기본).

## 정직한 한계 해소 (현재 의도적으로 남긴 것)

- [ ] **멀티바이트 안전 offset** — 현재 char-offset 편집은 ASCII 가정.
      ast-grep `range().index`와 JS 문자열 인덱스 정합성 확인 후 non-ASCII 소스 대응.
- [ ] **full type-check 게이트** — 현재 ts-morph 진단 **델타** best-effort.
      tsconfig 인지(프로젝트 실제 컴파일 옵션 로드) + 신규 에러의 종류 판별로 강화.
- [ ] **prop 순서/중복 정책 문서화** — free-var는 첫 등장 순서. 명시적으로 계약에 고정할지 결정.

## 추가 op (각각 단일 op·라운드트립 법칙 위에서)

- [ ] **`inlineComponent`** — `extractComponent`의 역연산. 단일 usage를 원본 자리로 되돌리기.
      GetPut/PutGet 쌍으로 두 op를 서로 검증 (extract → inline == identity).
- [ ] **`bindProp` / `renameProp`** — checked semantic patch 예시 하나 더 (브리프 §7 `bindProp` 언급).
- [ ] **`extractComponent` 대상 선택 개선** — line 기반 외에 graph node id(Task 3 preorder id) 기반 선택.
      graph id ↔ SgNode range 매핑을 정합적으로.

## 더 멀리 (채택 비용 큼 — 신중히)

- [ ] **cross-file (Tier 1 확장)** — import 따라가 타입/데이터플로 해석. 브리프의 "no-cross-file"을 A 레이어 편집 노드에 한해 완화.
- [ ] **B 카탈로그 확장** — 중첩 컴포넌트, `export { X }` 리스트, `styled`/기타 HOC(honest하게 opt-in 카탈로그).
- [ ] **outline `--items imports` 등 CLI 필터 정교화**, 디렉터리 export-surface 요약 뷰 개선.

---

## 참고 — 현재 상태 (완료)

- `packages/component-outline` (B): parse-now 추출기 + CLI + 계약 v0.1. 13 tests.
- `packages/cgraph` (A): graph lens + projection + 라운드트립 법칙 + `extractComponent`(Tier 1, fail-closed). 21 tests.
- 원칙: honest-partial · parse-now/no-index · no cross-file · graph는 ephemeral(TSX가 진실) · checked & atomic.
