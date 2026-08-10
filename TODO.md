# TODO — 브리프 밖 후보

브리프(Phase 1·2, Task 1–4)는 모두 구현 완료. 아래는 **브리프 범위 밖**의 확장 후보다.
착수 전 필요성/설계를 확인할 것 — 무거운 추상화·research 늪 금지 원칙은 그대로 유지.

## 우선순위 높음 — op를 실제로 쓸 수 있게

- [x] **편집 디스크 적용** — `extractComponent`의 `TextEdit[]`를 파일에 실제 반영하는 `applyEditsToFile`.
      fail-closed·atomic 유지 (임시 파일 → rename, 실패 시 원본 불변). 디스크 재해시로 stale 재확인.
- [x] **cgraph CLI** — `cgraph extract <file> --component <Name> --line <N> --name <New> [--write] [--json]`.
      `--write` 없으면 diff 미리보기만 (dry-run 기본). `--json`은 기계 판독 결과.

## 정직한 한계 해소 (현재 의도적으로 남긴 것)

- [ ] **멀티바이트 안전 offset** — 현재 char-offset 편집은 ASCII 가정.
      ast-grep `range().index`와 JS 문자열 인덱스 정합성 확인 후 non-ASCII 소스 대응.
- [ ] **full type-check 게이트** — 현재 ts-morph 진단 **델타** best-effort.
      tsconfig 인지(프로젝트 실제 컴파일 옵션 로드) + 신규 에러의 종류 판별로 강화.
      알려진 약점: 타입 해석은 `strict:true`, 델타 게이트는 `strict:false`로 불일치 →
      strict 전용 에러가 게이트를 통과. 두 패스의 strict 설정을 통일할 것.
      - [x] **fail-open 제거** — `introducesTypeErrors`는 진단 계산 실패 시 `false`(=통과)를
            반환해, "검사 결과 깨끗함"과 "검사 자체를 못 함"이 구별되지 않았다(fail-open).
            `checkTypeDelta → 'clean' | 'dirty' | 'unknown'` 삼상태로 교체하고 세 op는
            `unknown`을 `type-check-unavailable`로 **거부**한다. `type-gate.test.ts` 신규(9 tests).
      - [x] **strict 통일** — 두 패스가 `compiler-host.ts`의 `COMPILER_OPTIONS` 하나를 공유한다
            (`strict: true`). 단 `noImplicitAny`는 **끈다**: React 타입이 없는 소스에서는 모든
            intrinsic element가 TS7026, 모든 무주석 파라미터가 TS7006을 내는데, 이 잡음은
            *엘리먼트 개수에 비례*해서 `<span>` 하나를 추가하는 정당한 freehand 편집까지
            델타가 `dirty`로 거부한다(실제로 `verify-extraction` 테스트가 깨졌다).
            `noImplicitAny`는 추론이 아니라 보고만 바꾸므로 prop 타입 해석은 영향 없음.
            `strictNullChecks` 등 진짜 잡고 싶던 strict 전용 에러는 이제 걸린다.
- [ ] **스코프 인지 타입 해석** — `resolveTypesWithTsMorph`가 파일 전체에서 이름으로
      매칭(문서 순서 첫 매칭 승리)해 동명 바인딩이 있으면 잘못된 타입을 붙임.
      참조 지점의 심볼로 해석하도록 교체. `any`→`unknown` 축약(cleanType)도 재검토.
- [ ] **prop 순서/중복 정책 문서화** — free-var는 첫 등장 순서. 명시적으로 계약에 고정할지 결정.

## 추가 op (각각 단일 op·라운드트립 법칙 위에서)

- [x] **`inlineComponent`** — `extractComponent`의 역연산. 단일 usage를 원본 자리로 되돌리기.
      GetPut 쌍으로 두 op를 서로 검증 (extract → inline == identity, **byte-exact**). prop 참조를 인자 표현식으로 치환, dead 선언 삭제. fail-closed(비단일 usage·export된 target·arrow target·shadowing 등 거부).
- [x] **`verifyExtraction` (model-edits/tool-verifies 하이브리드)** — 에이전트의 자유편집을 fail-closed 게이트로 수락/거부(컴파일 델타 + 구조 건전성). eval에서 arm A(맨손)·B(도구)를 **strictly dominate**: collision(깨진 편집) 거부 + shadowing(도구가 오거부하는 유효 편집) 수락. CLI `cgraph verify`. v1은 static 게이트 — moved subtree의 행위 동등성(render 기반)은 다음 단계.
- [x] **`verifyExtraction` v2 (render 기반 행위 동등성)** — `evals/render-equiv.mjs`: 원본/후보를 transpile→`react-dom/server`로 렌더해 HTML 비교. `count → count + 1`처럼 타입은 통과하나 출력을 바꾸는 편집을 포착(v1 static 게이트는 통과시킴 → **v2 strictly stronger**). honest-partial: 주어진 prop 샘플·self-contained 컴포넌트 한정. react 런타임 의존이라 cgraph 코어가 아닌 `evals/`에 측정 oracle로 둠.
- [ ] **`bindProp` / `renameProp`** — checked semantic patch 예시 하나 더 (브리프 §7 `bindProp` 언급).
- [ ] **`extractComponent` 대상 선택 개선** — line 기반 외에 graph node id(Task 3 preorder id) 기반 선택.
      graph id ↔ SgNode range 매핑을 정합적으로.

## 더 멀리 (채택 비용 큼 — 신중히)

- [ ] **cross-file (Tier 1 확장)** — import 따라가 타입/데이터플로 해석. 브리프의 "no-cross-file"을 A 레이어 편집 노드에 한해 완화.
- [x] **B 카탈로그 확장 (1차)** — class 컴포넌트(render 기반, honest), `export { X as Y }` 리네임 re-export 처리 완료.
- [ ] **B 카탈로그 확장 (계속)** — 중첩 컴포넌트, `styled`/기타 HOC(honest하게 opt-in 카탈로그).
- [ ] **outline `--items imports` 등 CLI 필터 정교화**, 디렉터리 export-surface 요약 뷰 개선.

---

## 참고 — 현재 상태 (완료)

- `packages/component-outline` (B): parse-now 추출기 + CLI + 계약 v0.1. 19 tests (class 컴포넌트 + 리네임 re-export 포함).
- `packages/cgraph` (A): graph lens + projection + 라운드트립 법칙 + `extractComponent` ⇄ `inlineComponent`(byte-exact 역연산 쌍, Tier 1, fail-closed, 정직한 부분집합) + `applyEditsToFile`(atomic 디스크 적용) + `cgraph` CLI(`extract`/`inline`, dry-run/`--write`/`--json`). 84 tests.
  - 세 op가 공유하는 것: `checked-op`(edits 적용 → 구조 검증 → 타입 게이트 순서 + `CommonFailure`),
    `ast-utils`(`collectBoundNames`/`forEachReference` — free-var 분석), `skel-utils`(`containsTag`),
    `compiler-host`(단일 컴파일러 설정), `type-gate`. CLI도 `runEditOp` 하나로 합쳐 op별로는
    파싱·표시 문자열만 남는다.
- 원칙: honest-partial · parse-now/no-index · no cross-file · graph는 ephemeral(TSX가 진실) · checked & atomic.
