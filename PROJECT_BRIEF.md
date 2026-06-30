# component-graph — 프로젝트 브리프

에이전트를 위한 React/JSX 구조 도구 스택. 두 개의 레이어로 구성되며, 아래층이 위층의 의존성이다.

- **B 레이어 — `component-outline`**: ast-grep 기반의 parse-now 구조 추출기. TSX → 컴포넌트 골격(JSON). *배송 가능한 결과물.* 먼저, 끝까지 만든다.
- **A 레이어 — `cgraph`**: B의 출력을 graph로 받아 checked semantic patch를 적용하고, 검증된 JSX projection으로 되돌리는 편집 레이어. *흥미로운 프로토타입.* B 위에 마퀴 op 하나만 올린다.

> 한 줄 thesis: **graph(구조)를 진실에 가깝게 다루되, 모르는 것은 정직하게 opaque로 남기고, 인덱스 없이 즉석 계산한다.**

---

## 1. 계보 (왜 이렇게 생겼나)

이 프로젝트는 JXON(XML↔JS object의 lossless·bidirectional 변환 라이브러리) 재작성에서 출발한 사고 실험의 산물이다. 핵심 교훈 세 가지가 설계에 그대로 박혀 있다.

1. **schemaless·bidirectional·lossless는 동시에 못 가진다.** 스키마 없이 무손실을 원하면 표현이 원본과 isomorphic해질 때까지 장황해진다(JXON verbosity 3). 비용을 *어디에 둘지*가 설계의 핵심.
2. **React element 트리 = JXON convention 객체.** `{type, props, children}` ≈ `{tagName, $attrs, _children}`. JSX는 그 트리의 projection. 그래서 "JSX↔graph"는 "XML↔object"와 같은 문제다.
3. **에이전트에게는 트릴레마 부호가 뒤집힌다.** 사람은 텍스트가 ergonomic하고 구조가 ceremony지만, 에이전트는 구조가 ergonomic하고 텍스트가 모호·고비용. 그래서 명시적 핸들(타입·node·source range)을 *원한다*.

설계 영감: zerolang(graph가 진실, 텍스트가 projection, checked patch) + ast-grep outline(parse-now, no-index, no cross-file, declarative catalog, honest-partial). **단, zerolang의 영속 graph는 채택 비용이 크므로 채택하지 않는다** — graph는 편집할 때만 즉석 계산하는 ephemeral lens이고, TSX가 진실원천으로 남는다(brownfield 친화).

---

## 2. 아키텍처: 2-tier, B가 A의 dependency

```
                ┌─────────────────────────────────────────────┐
   에이전트 ──▶ │  B: component-outline   (Tier 0, 싸다)        │
   "이 파일      │  parse-now · no-index · no cross-file         │
    구조 보여줘"  │  → 컴포넌트·props·hooks·JSX containment·range  │
                └───────────────────────┬─────────────────────┘
                                        │  outline.json (계약)
                                        ▼
                ┌─────────────────────────────────────────────┐
   에이전트 ──▶ │  A: cgraph patch        (Tier 1, on-demand)   │
   "Avatar로     │  outline → graph → checked semantic patch     │
    추출해줘"     │  → 타입/data-flow는 편집 노드에만 풀고 검증     │
                │  → 검증된 JSX로 reproject (source range로 텍스트 편집) │
                └─────────────────────────────────────────────┘
```

**Tier 0 (B)가 아는 것**: 어떤 컴포넌트가 있고, prop 시그니처(이름 + 미해결 typeRef), hook *호출*, JSX element containment, source range, import/export surface.

**Tier 0가 모르는 것 (의도적으로 Tier 1로 미룸)**:
- `src={user.avatar}`에서 `user`가 *어디서 흘러오는지* (cross-file data-flow)
- 타입 정합성 (타입 체커 없음)
- `{cond && <X/>}` 같은 분기 → **opaque expr 노드**로 남김 (`<Show>` edge 아님)
- `useMemo([user])` 의존성 정합성 (hook 호출은 보이되 dep edge는 안 만듦)

이것들은 **편집 대상 노드 하나에 대해서만** Tier 1(tsc/ts-morph/LSP)으로 즉석 계산하고 버린다. 영속 인덱스 없음 → 병렬 git worktree가 그냥 디스크 위 소스로 남는다.

---

## 3. 설계 원칙 (load-bearing — 어기지 말 것)

1. **honest-partial.** 모르는 것은 추측하지 않는다. 시그니처에 보이는 것만 보존하고, 이름이 같다고 관계를 발명하지 않는다. 미해결 바인딩은 `{kind:"expr"}` 소스 텍스트로 정직하게 남긴다(`{kind:"path"}` 같은 *해석된* edge는 Tier 1만 만든다).
2. **parse-now, no-index.** 매번 즉석 파싱. 빌드/갱신/무효화할 인덱스를 만들지 않는다.
3. **stay local, no cross-file.** B는 한 파일만 본다. import는 텍스트로 기록하되 따라가지 않는다(cross-file = Tier 1).
4. **declarative catalog.** "무엇이 컴포넌트/멤버인가"는 데이터(룰 카탈로그)로 둔다. 언어/변종 커버리지 추가 = 카탈로그 항목 추가이지, walker 분기 추가가 아니다.
5. **graph는 ephemeral, TSX가 진실.** zerolang을 뒤집어, 채택 비용을 0으로. 그 어떤 영속 `.graph` 파일도 만들지 않는다.
6. **checked & atomic (A 레이어).** patch는 stale-hash/타입/cycle 검증을 통과하지 못하면 store를 건드리지 않는다. fail-closed.

---

## 4. 빌드 순서

| 단계 | 내용 | 성격 |
|---|---|---|
| **Phase 1 (B)** | `cgraph-extract.ts` → 실제 `component-outline` CLI + 안정 JSON 계약 + 카탈로그 확장 | 경계 분명, 배송 가능 |
| **Phase 2 (A)** | 마퀴 op 하나 — `extractComponent` — 를 실제 TSX 위에서 방탄으로 | 개념 검증, 단일 op |

**욕심 금지**: Phase 2에서 cgraph 전체 lens를 짓지 말 것. 단 하나의 op만. 그게 ceremony가 제일 심한 리팩터라 payoff가 보이고, research 늪을 피한다.

---

## 5. Phase 1 상세 — `component-outline` (먼저 이것부터)

### 목표
`cgraph-extract.ts`(이미 동작하는 추출기)를 CLI 도구로 승격하고, 에이전트가 먹기 좋은 JSON 계약을 고정하고, 선언 변종 커버리지를 넓힌다.

### 기존 자산 (재사용)
- `cgraph-extract.ts` — `@ast-grep/napi`(`Lang.Tsx`) 기반 추출기. 이미 함수/화살표 컴포넌트, props(object_pattern), hook 호출, JSX 트리(containment), import/export, source range를 뽑는다. **이게 Phase 1의 씨앗.**
- `outline.json` — 출력 스키마 샘플.

### 할 일
1. **CLI화**: `component-outline <path> [--json] [--match <Name>] [--items imports]`
   - 단일 파일과 디렉터리(폴더는 export surface 기본) 모두.
   - 사람용 outline 뷰(현재 `printOutline`) + `--json` 기계 판독 출력.
2. **JSON 계약 고정** (아래 §6). 버전 필드 포함. 이게 에이전트/A 레이어가 의존하는 인터페이스다.
3. **카탈로그 확장** (`CATALOG` + walker). 커버리지 목록:
   - `export default function`, 익명 default 컴포넌트
   - `React.memo(...)`, `forwardRef(...)`, `memo(forwardRef(...))` 래핑
   - 화살표가 block body(`=> { ... return ... }`)인 경우와 expression body(`=> <jsx/>`) 모두 (현재 둘 다 되는지 테스트로 확인)
   - prop 변종: 단일 `props` 식별자, default 값(`{ a = 1 }`), rest(`{ ...rest }`), renamed(`{ a: b }` — pair_pattern은 이미 일부 처리)
   - 같은 파일 내 다중 컴포넌트, 중첩 컴포넌트(컴포넌트 안 함수 컴포넌트)는 *비목표*로 명시할지 결정
4. **테스트**: 위 변종마다 fixture TSX + 기대 JSON. ast-grep `kind` 이름은 grammar 의존이므로(예: fragment는 별도 kind가 아니라 *tag 없는 `jsx_element`*), 변종별 회귀 테스트가 카탈로그 정확성의 핵심.
5. **honest-partial 유지**: 새 커버리지를 넣되, 해석이 필요한 건(타입·data-flow) 절대 넣지 않는다. 애매하면 `expr`/`typeRef`(미해결)로.

### 비목표 (Phase 1에서 하지 않음)
- 타입 해석, import 따라가기, data-flow edge, dep-array 의미론. 전부 Tier 1.
- `outline` 서브커맨드 자체에 의존하지 않는다(alpha·커스텀 추출기 미지원). ast-grep *코어*(napi + 직접 룰)로 짠다.

---

## 6. JSON 계약 (B의 출력, A의 입력)

`outline.json` 기준. Phase 1에서 이걸 고정한다.

```jsonc
{
  "version": "0.1",
  "file": "Profile.tsx",
  "imports": [
    { "source": "./Avatar", "names": ["Avatar"], "line": 1 }   // 따라가지 않음(기록만)
  ],
  "components": [
    {
      "name": "Profile",
      "exported": true,
      "symbolType": "function-component",      // | "arrow-component" | ...
      "params": [
        { "name": "user", "typeRef": "ProfileProps" }          // typeRef는 미해결 문자열
      ],
      "hooks": [
        { "call": "useState", "binds": ["open", "setOpen"] }   // dep edge 없음
      ],
      "root": {                                                 // JSX containment
        "kind": "element",                                      // element|component|fragment|text|expr
        "tag": "div",
        "props": {
          "className": { "kind": "literal", "text": "card" },
          "data-open": { "kind": "expr", "text": "open" }       // ← path 아님. opaque.
        },
        "children": [ /* SkelEl[] */ ],
        "line": 11
      },
      "range": [6, 18]                                          // 1-based [start, end] line
    }
  ],
  "exportsSurface": ["Profile"]
}
```

**불변식**: `props`의 값은 `literal | expr` 둘뿐. `path`(해석된 data-flow)는 Tier 0 출력에 절대 없다. A 레이어가 Tier 1에서 일부 `expr`을 `path`로 *승격*한다.

---

## 7. Phase 2 상세 — `cgraph`의 `extractComponent` 하나

### 기존 자산
- `cgraph.ts` — graph 모델 + checked patch 엔진 + `extractComponent`/`bindProp`/projection + 라운드트립 검증이 *toy 모델 위에서* 이미 동작한다. **단 importer가 손으로 짠 `parseJsx`였다 — 그걸 B로 교체한다.**

### 할 일
1. **B → graph 어댑터**: `outline.json` → cgraph graph. `expr` 바인딩은 그대로 들고 온다.
2. **Tier 1 승격 (선택 노드만)**: 추출 대상 서브트리의 free variable을, ts-morph/tsc로 풀어 typeRef를 실제 타입으로 해석하고 `expr→path`로 올린다. 이게 "data-flow는 안 싸진다 — 지연·국소화될 뿐"을 실제로 마주하는 자리.
3. **`extractComponent` 방탄화**: 실제 TSX 위에서 (a) free var 추론 → 새 컴포넌트 Props, (b) 원본을 단일 usage로 rewire, (c) 타입 검증, (d) 검증된 JSX로 reproject. source range로 정확한 텍스트 편집 산출.
4. **fail-closed 유지**: stale hash, 타입 불일치, 미해결 binding, cyclic — store를 건드리기 전에 거부.

### 정직한 한계 (문서에 남길 것)
- opaque 탈출구(`.map`/`&&`/render prop) 때문에 graph는 real-world JSX에 대해 **절대 total이 안 된다**. extractComponent가 opaque 노드를 포함하면, 그 노드는 불투명한 채로 통째 이동시키되 내부는 건드리지 않는다(보수적·정확).
- total을 원하면 입력 제약(control-flow 컴포넌트 강제)이 필요하나, 채택을 깎으므로 Phase 2 범위 밖.

---

## 8. 기술 스택 / 환경

- TypeScript (strict), ESM 지향, npm.
- `@ast-grep/napi` (`Lang.Tsx`) — B의 파싱 엔진. native addon, prebuilt 바이너리.
- Phase 2 Tier 1: `ts-morph` 또는 `typescript` 컴파일러 API.
- 테스트: fixture TSX + 기대 JSON 스냅샷.
- 의존성 최소·경계 명확(just-bash 스타일). 무거운 추상화 금지.

---

## 9. 첫 작업 (Claude Code, 여기서 시작)

> **Task 1 — repo 스캐폴드 + B의 CLI화**
>
> 1. `pnpm`(또는 npm) 모노레포 또는 단일 패키지 스캐폴드. `packages/component-outline`.
> 2. `cgraph-extract.ts`를 패키지로 이식: 추출 로직(`extract`)과 뷰(`printOutline`)를 분리. `extract`는 순수 함수(`(file, code) => Outline`)로.
> 3. CLI 엔트리: `component-outline <path> [--json] [--match <Name>]`. 파일 읽어 `extract` 호출, 사람용/JSON 출력 분기.
> 4. `Outline` 타입에 `version: "0.1"` 추가, §6 계약으로 export.
> 5. fixture 3개로 스냅샷 테스트: (a) 함수 컴포넌트 + hooks + 삼항/`&&`/텍스트(현 SAMPLE), (b) 화살표 expression-body 컴포넌트, (c) `export default function`.
> 6. README: parse-now/no-index/no-cross-file/honest-partial 원칙과 §6 계약 명시.
>
> 통과 기준: `component-outline fixtures/a.tsx --json`이 §6 형태의 안정 JSON을 내고, 세 fixture 스냅샷이 green.

그 다음 Task 2에서 카탈로그 변종(memo/forwardRef/default)을 넓히고, Task 3부터 A 레이어 어댑터로 넘어간다.

---

## 부록 — 한 줄 정리

JXON(XML↔object)이 lossless·bidirectional 교훈을 줬고 → **B(component-outline)**가 정직한 parse-now *reader*, → **A(cgraph)**가 checked bidirectional *editor*. JXON의 유령이 둘 다에 있다: B의 importer는 createObjTree의 환생, A의 라운드트립은 GetPut/PutGet 법칙. **B를 먼저 끝까지, A는 op 하나만.**
