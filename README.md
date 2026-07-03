# component-graph

에이전트를 위한 React/JSX 구조 도구 스택. 두 레이어로 구성되며, 아래층(B)이 위층(A)의 의존성이다.

- **B — [`component-outline`](./packages/component-outline)**: ast-grep 기반 parse-now 구조 추출기. TSX → 컴포넌트 골격(JSON 계약 v0.1). *배송 가능한 reader.*
- **A — [`cgraph`](./packages/cgraph)**: B의 출력을 ephemeral graph로 받아 checked semantic patch를 적용하고 검증된 JSX로 되돌리는 편집 레이어. *checked bidirectional editor.*

> 한 줄 thesis: **graph(구조)를 진실에 가깝게 다루되, 모르는 것은 정직하게 opaque로 남기고, 인덱스 없이 즉석 계산한다.**

계보와 상세 설계는 [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md), 확장 후보는 [`TODO.md`](./TODO.md) 참고.

## 아키텍처

```
              ┌──────────────────────────────────────────────┐
 에이전트 ──▶ │  B: component-outline   (Tier 0, 싸다)         │
 "구조 보여줘"  │  parse-now · no-index · no cross-file          │
              │  → 컴포넌트·props·hooks·JSX containment·range   │
              └───────────────────────┬──────────────────────┘
                                      │  outline (계약 v0.1)
                                      ▼
              ┌──────────────────────────────────────────────┐
 에이전트 ──▶ │  A: cgraph              (Tier 1, on-demand)    │
 "Count로      │  outline → graph → checked patch               │
  추출해줘"     │  → 편집 노드만 타입/data-flow 해석 후 검증        │
              │  → 검증된 JSX로 reproject (source range 편집)    │
              └──────────────────────────────────────────────┘
```

- **Tier 0 (B)가 아는 것**: 컴포넌트, prop 시그니처(이름 + 미해결 typeRef), hook *호출*, JSX containment, source range, import/export surface.
- **Tier 0가 모르는 것 (의도적으로 Tier 1로 미룸)**: cross-file data-flow, 타입 정합성, 분기(`{cond && <X/>}`는 opaque expr), dep-array 의미론. 이것들은 A 레이어가 **편집 대상 노드 하나에 대해서만** ts-morph로 즉석 계산한다.

## 설계 원칙 (load-bearing)

1. **honest-partial** — 모르는 것은 추측하지 않는다. 미해결 바인딩은 opaque `expr`로 남긴다.
2. **parse-now, no-index** — 매번 즉석 파싱. 빌드/갱신/무효화할 인덱스 없음.
3. **stay local, no cross-file** — B는 한 파일만. import는 텍스트로 기록하되 따라가지 않는다.
4. **declarative catalog** — "무엇이 컴포넌트인가"는 룰 카탈로그(데이터)로. 커버리지 추가 = 카탈로그 항목 추가.
5. **graph는 ephemeral, TSX가 진실** — 어떤 `.graph` 파일도 만들지 않는다. brownfield 친화.
6. **checked & atomic** — patch는 stale-hash/타입/구조 검증을 통과하지 못하면 store를 건드리지 않는다. fail-closed.

## 패키지

| 패키지 | 레이어 | 역할 |
|---|---|---|
| [`component-outline`](./packages/component-outline) | B (Tier 0) | TSX → outline JSON 계약 v0.1. CLI + 순수 `extract(file, code)`. |
| [`cgraph`](./packages/cgraph) | A (Tier 1) | ephemeral graph lens + 라운드트립 법칙 + 마퀴 op `extractComponent`. |

## 빠른 시작

```sh
pnpm install
pnpm build          # 전체 빌드 (tsc, strict ESM)
pnpm test           # 전체 테스트

# B: 파일 구조를 JSON으로
pnpm --filter component-outline dev packages/component-outline/fixtures/a.tsx --json

# A: JSX 서브트리를 새 컴포넌트로 추출 (CLI)
#   dry-run — diff만 보여주고 파일은 건드리지 않음 (기본)
pnpm --filter cgraph dev extract packages/cgraph/fixtures/card.tsx \
  --component Card --line 12 --name Count
#   --write 로 디스크에 atomic 적용 (stale 재확인·fail-closed), --json 은 기계 판독 결과
pnpm --filter cgraph dev extract packages/cgraph/fixtures/card.tsx \
  --component Card --line 12 --name Count --write

# A: 라이브러리로도 사용 가능
#   const r = extractComponent({ file, code, component: 'Card', targetLine: 12, newName: 'Count' })
#   if (r.ok) applyEditsToFile({ file, edits: r.edits, expectedHash: hashSource(code) })
```

### 예시 — `extractComponent`

`<span className="count">{count}</span>` 를 `Count`로 추출하면:

```tsx
// before
export function Card({ title, count }: CardProps) {
  return (
    <section className="card">
      <span className="count">{count}</span>
    </section>
  );
}

// after — 원본은 단일 usage로 rewire, 새 컴포넌트는 형제로 삽입 (count: number 해석됨)
export function Card({ title, count }: CardProps) {
  return (
    <section className="card">
      <Count count={count} />
    </section>
  );
}

function Count({ count }: { count: number }) {
  return (
    <span className="count">{count}</span>
  );
}
```

free var는 enclosing 스코프에서 prop으로 승격되고, 타입은 ts-morph(Tier 1)로 편집 노드에 대해서만 해석된다. `stale-hash`·`name-collision`·`cyclic`·타입 게이트 등 가드를 하나라도 통과 못 하면 편집을 산출하지 않는다(fail-closed).

## 기술 스택

- TypeScript (strict, ESM/NodeNext), pnpm 워크스페이스 모노레포.
- `@ast-grep/napi` (`Lang.Tsx`) — B의 파싱 엔진.
- `ts-morph` — A 레이어의 Tier 1 타입/data-flow 해석.
- vitest — fixture TSX + 스냅샷/단언 테스트.

## 한 줄 정리

JXON(XML↔object)이 lossless·bidirectional 교훈을 줬고 → **B**가 정직한 parse-now *reader*, → **A**가 checked bidirectional *editor*. B의 importer는 createObjTree의 환생, A의 라운드트립은 GetPut/PutGet 법칙.
