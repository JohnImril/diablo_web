# Architecture

## Layout

- `src/modules/<domain>/{core,adapters}` — domain logic
- `src/app/runtime/*` — orchestration (imperative shell)
- `src/app/ui/*`, `src/components/*`, `src/app/uiHooks/*` — UI layer
- `src/shared/*` — shared **pure-only** helpers/parsers
- `src/constants/*`, `src/icons/*` — shared (utils should be pure unless explicitly documented)

## Domains (modules)

- **engine**: WebAssembly worker loading/bridge, protocol handling, intents application.
- **network**: WebRTC transport, packet/batch IO.
- **storage**: saves/FS operations, import/export helpers.
- **input**: DOM input collection, command mapping.
- **mpqcmp**: MPQ compression pipeline (WASM/worker adapter + pure helpers).

## Layering Rules

**Core = pure**, **adapters = side effects**, **runtime = orchestration**, **UI = rendering/state**.

- **core**: pure functions/types/mapping. No DOM/Window/Worker/IO.
- **adapters**: side effects (IO/DOM/Worker/WebRTC/FS). No React/UI state.
- **runtime**: wires adapters + core, owns lifecycle & events. No UI components.
- **UI**: rendering + local UI state only. Calls runtime APIs and subscribes to runtime events. No direct side effects.

## Entrypoints

- `src/app/runtime/index.ts` — runtime public API (consumer-safe)
- `src/modules/<domain>/index.ts` — **core-only** exports (types/pure helpers)
- `src/modules/<domain>/adapters.ts` — adapter exports (**runtime-only**)

## Import Boundaries (Hard Rules)

- `src/modules/**/core/**` must not import from:
  - `src/modules/**/adapters/**`
  - `src/app/**`
  - `src/components/**`

- `src/modules/**/adapters/**` must not import from:
  - `src/app/runtime/**`
  - `src/app/ui/**`
  - `src/app/uiHooks/**`
  - `src/components/**`
  - `src/App.tsx`

- `src/app/runtime/**` may import from:
  - `src/modules/**/core/**`
  - `src/modules/**/adapters/**`
  - `src/shared/**`

  and must not import from UI paths:
  - `src/app/ui/**`, `src/app/uiHooks/**`, `src/components/**`, `src/App.tsx`

- UI (`src/App.tsx`, `src/app/ui/**`, `src/app/uiHooks/**`, `src/components/**`) must not import from:
  - `src/modules/**` (neither core nor adapters)
  UI imports only:
  - `src/app/runtime/**`
  - `src/shared/**`
  - UI folders + constants/icons/(pure utils)

## Adding a New Feature (Template)

1) **Core**
   - Add pure types/functions to `src/modules/<domain>/core/`.

2) **Adapters**
   - Add side-effect code to `src/modules/<domain>/adapters/`.
   - Export adapter API via `src/modules/<domain>/adapters.ts`.

3) **Runtime**
   - Wire core + adapters inside `src/app/runtime/`.
   - Expose runtime methods and emit runtime events.

4) **UI**
   - Call runtime methods and subscribe to runtime events.
   - Keep UI state inside React. No direct side effects.