# TODO

우선순위 축은 [ADR-0001](./docs/adr/0001-verification-is-the-product.md)이 정한다:
**판단할 수 있는 범위를 넓히는 일이 우선이고, 편집할 수 있는 범위를 넓히는 일은 아니다.**

완료 항목은 여기 쌓지 않는다 — 무엇을 왜 그렇게 했는지는 git 이력과 [`docs/adr/`](./docs/adr)에.
무거운 추상화·research 늪 금지 원칙은 그대로.

## 1. 판단 범위 넓히기 (0001의 방향)

- [ ] **행동 오라클의 사정거리** — `render-equiv`는 self-contained 컴포넌트 + 주어진 prop 샘플에서만
      동작한다. 실제 컴포넌트는 import·context·effect를 갖는다. **이 저장소에서 가장 값진 미해결 문제**:
      유일하게 일반적인(추출에 국한되지 않는) 오라클인데 사정거리가 제일 좁다.
- [ ] **구조 게이트의 일반화** — `verifyExtraction`의 구조 검사는 "정확히 하나의 net-new 컴포넌트",
      "새 컴포넌트가 참조된다" 같은 **추출 전용** 불변식이다. 일반형 — *이 편집이 행동을 보존하는가* —
      는 훨씬 크고, 지금 게이트는 그 특수 사례 하나만 답한다.
- [ ] **full type-check 게이트** — tsconfig 인지(프로젝트 실제 컴파일 옵션 로드) + **신규 에러의 종류
      판별**. 현재 델타는 개수만 세므로 에러 하나가 사라지고 하나가 생기면 clean으로 읽힌다.
      strict 설정은 이미 통일됨 — 왜 `noImplicitAny`를 끄는지는 [ADR-0004](./docs/adr/0004-one-compiler-host-without-noimplicitany.md).
- [ ] **cross-file** — import를 따라가 타입·데이터플로를 해석. 브리프의 "no-cross-file"을 완화하는 일인데,
      0001 아래서는 **게이트를 위한 것**으로 재해석된다: 위 두 항목의 병목이 사실 같다. self-contained
      제약을 푸는 것이 곧 import를 따라가는 것이다. 채택 비용 큼 — 신중히.

## 2. 근거 보강 (0001이 얇은 데이터 위에 서 있다)

- [ ] **eval 넓히기** — 0001의 결론은 과제 4개·모델 1개·레코드 41개에서 나왔다. 방향은 일관되지만
      n이 작다. 과제 수, 모델 다양성, 더 어려운 편집 종류(다중 파일·상태 이동·prop drilling)를 늘릴 것.
      **이걸 넓히기 전에 0001을 강하게 밀지 말 것** — 재정의의 근거가 곧 이 데이터다.

## 3. 출하된 코드의 정확성 부채 (전략과 무관하게 버그)

- [ ] **멀티바이트 안전 offset** — char-offset 편집이 ASCII를 가정한다. non-ASCII 소스에서 잘못된 편집을
      낸다. ast-grep `range().index`와 JS 문자열 인덱스의 정합성 확인 후 대응.
- [ ] **스코프 인지 타입 해석** — `resolveTypesWithTsMorph`가 파일 전체에서 이름으로 매칭(문서 순서 첫
      매칭 승리)해, 동명 바인딩이 있으면 **잘못된 타입**을 붙인다. 참조 지점의 심볼로 해석하도록 교체.
      `cleanType`의 `any`→`unknown` 축약도 재검토.

## 4. 0001에 따라 보류 — 되살릴 조건을 함께 적는다

지우지 않고 남기는 이유: 왜 **안 하는지**가 하는 것만큼 값진 기록이다.

- [ ] ~~**`bindProp` / `renameProp`**~~ — checked semantic patch 예시 하나 더(브리프 §7). 0001이 이미
      지배당했다고 보고한 방향으로 한 걸음 더 가는 일.
      **되살릴 조건**: 대량·기계적 편집(사이트마다 모델을 부르기 아까운 규모)에서 도구가 이긴다는 증거.
      현재 eval은 단일 파일·agent-in-the-loop만 측정했으므로 이 영역은 **미측정**이지 반증된 게 아니다.
- [ ] ~~**`extractComponent` 대상 선택 개선(graph node id 기반)**~~ — 0001에 더해
      [ADR-0002](./docs/adr/0002-graph-lens-is-read-only.md)와도 어긋난다: 렌즈는 편집 경로 밖이고,
      op가 필요한 char offset을 렌즈는 갖고 있지 않다.
- [ ] ~~**스코프 인지 free-var 분석(shadowing 오거부 해소)**~~ — `analyzeFreeVars`가 이름이 target 안에서
      free이자 bound면 fail-closed한다. eval에서 유일하게 정량화된 도구의 손실(2/2 오거부)이지만,
      **게이트는 이미 이 편집을 수락한다**(arm C). 고쳐도 나아지는 건 arm B뿐이고 그쪽이 지배당한 쪽이다.
      (타입 해석 쪽 스코프 문제는 §3의 별개 항목 — 두 함수가 다르다.)

## 5. 작은 것들

- [ ] **B 카탈로그 확장 (계속)** — 중첩 컴포넌트. `styled` 류 HOC은
      [ADR-0006](./docs/adr/0006-readers-are-tagged-by-position.md)의 `createComponentReaders(hocNames)`
      opt-in 경로로 이미 가능.
- [ ] **prop 순서/중복 정책 문서화** — free-var는 첫 등장 순서. 계약에 명시적으로 고정할지 결정.
- [ ] **outline CLI 필터 정교화** — `--items imports` 등, 디렉터리 export-surface 요약 뷰 개선.

## 6. 인프라

- [ ] **CI 없음** — 이 저장소의 모든 보증(138 tests, 빌드, eval 로그 검증)이 로컬 실행에만 의존한다.
      `pnpm -r build && pnpm -r test && pnpm --filter evals check` 하나면 위 ADR들이 만든 불변식이
      스스로 강제된다. 저장소의 `session-start-hook` 스킬이 이 용도.

---

## 참고 — 현재 상태

- **B `component-outline`**: parse-now 추출기 + CLI + 계약 v0.1 + 리더 주입 seam. 29 tests.
- **A `cgraph`**: `extractComponent` ⇄ `inlineComponent`(byte-exact 역연산 쌍) + `verifyExtraction`
  (static 게이트) + `applyEditsToFile`(atomic) + CLI + 읽기 전용 graph lens. 109 tests.
- **`evals`**: arm A/B/C 하네스 + `render-equiv`(행동 동등성 오라클) + 스키마 소유(`task.mjs`,
  `record.mjs`). 결정적 오라클만 사용 — 측정 대상 도구는 채점에 쓰지 않는다([ADR-0003](./docs/adr/0003-scorer-must-not-use-the-tool-it-measures.md)).
- 용어는 [`CONTEXT.md`](./CONTEXT.md), 결정과 근거는 [`docs/adr/`](./docs/adr).
- 원칙: honest-partial · parse-now/no-index · graph는 ephemeral(TSX가 진실) · checked & atomic ·
  fail-closed("검사 못 함"은 거부다).
