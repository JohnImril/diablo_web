# Architecture

## Layout

- `src/modules/<domain>/{core,adapters}` — domain logic
- `src/app/runtime/*` — orchestration (imperative shell)
- `src/app/updates/*` — service worker updates, reload coordination, and cross-tab activity
- `src/app/ui/*`, `src/components/*`, `src/app/uiHooks/*` — UI layer
- `src/shared/*` — shared helpers/parsers, including existing browser helpers documented below
- `src/constants/*`, `src/icons/*` — shared (utils should be pure unless explicitly documented)

## Domains (modules)

- **engine**: WebAssembly worker loading/bridge, protocol handling, intents application.
- **network**: WebRTC and experimental WebSocket transport, packet/batch IO.
- **storage**: saves/FS operations, import/export helpers.
- **input**: DOM input collection, command mapping.
- **mpqcmp**: MPQ compression pipeline (WASM/worker adapters).

## Layering Rules

**Core = pure**, **adapters = side effects**, **runtime = orchestration**, **UI = rendering/state**.

- **core**: domain functions/types/mapping. New logic should be pure, with no DOM/Window/Worker/IO.
- **adapters**: side effects (IO/DOM/Worker/WebRTC/FS). No React/UI state.
- **runtime**: wires adapters + core, owns lifecycle & events. No UI components.
- **updates**: coordinates service worker registration, tab activity, update application, and reloads with pending storage writes.
- **UI**: rendering + local UI state. Calls runtime APIs and subscribes to runtime and update events.
  Keep game/storage/network side effects behind runtime APIs; UI effects may manage subscriptions and browser presentation.

### Current Exceptions and Responsibilities

Three existing exceptions to the purity rules need care when adding dependencies:

- Shared browser helpers (`buffers`, `download`, `browserActions`, `wsUrl`) perform FileReader/DOM/API calls or
  read browser configuration. Do not import these effects into pure domain code.
- `engine/core/applyEngineIntent` invokes the injected game handle; `storage/core/pendingWrites` maintains
  promise/timer state shared by runtime and updates. Other core logic should remain pure.
- UI manages file pickers, dialogs, subscriptions, and reload after runtime preparation. It may consume
  `app/updates` directly, while game/storage/network operations still go through runtime.

## Entrypoints

- `src/app/runtime/index.ts` — runtime public API (consumer-safe)
- `src/modules/input/index.ts` — core command exports. Other domains currently use direct core imports;
  a domain `index.ts`, if introduced, should export only core APIs.
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
    - `src/app/updates/**`
    - `src/components/**`
    - `src/App.tsx`

- `src/app/runtime/**` may import from:
    - `src/modules/**/core/**`
    - `src/modules/**/adapters/**`
    - module core/adapter entrypoints and runtime-local modules
    - `src/shared/**`
    - shared types/constants

    and must not import from UI paths:
    - `src/app/ui/**`, `src/app/uiHooks/**`, `src/components/**`, `src/App.tsx`

- UI (`src/App.tsx`, `src/app/ui/**`, `src/app/uiHooks/**`, `src/components/**`) must not import from:
    - `src/modules/**` (neither core nor adapters)

    UI may import:
    - `src/app/runtime/**`
    - `src/app/updates/**` for application updates
    - `src/shared/**`
    - UI folders + shared types/constants/icons/(pure utils)

`.oxlintrc.json` enforces restricted import patterns for core, adapters, runtime, and UI source files.
These checks operate on import specifiers; passing lint does not prove that a helper is pure or that all
transitive dependencies follow the intended boundaries. Review new imports and side effects as well.

## Adding a New Feature (Template)

1. **Core**
    - Add pure types/functions to `src/modules/<domain>/core/`.

2. **Adapters**
    - Add side-effect code to `src/modules/<domain>/adapters/`.
    - Export adapter API via `src/modules/<domain>/adapters.ts`.

3. **Runtime**
    - Wire core + adapters inside `src/app/runtime/`.
    - Expose runtime methods and emit runtime events.

4. **UI**
    - Call runtime methods and subscribe to runtime events.
    - Keep UI state inside React. Route game/storage/network operations through runtime;
      use the update coordinator for PWA update state and application.

## Save Storage Ownership

The IndexedDB filesystem acquires the origin-wide exclusive Web Lock `diablo_fs:session` before opening the
database, reconciling data epochs, or reading snapshots. One document owns the entire filesystem; repeated
initialization through the same loaded module returns the same promise, including a rejected initialization
promise. Other tabs fail immediately with instructions to close the owner and reload.

The lock callback stays pending after successful initialization. The app does not release ownership on engine
stop, failed writes, retries, blur, or pagehide. Browser termination of the owning agent releases its locks;
the application does not use a pagehide handler as a release signal.
Initialization failure closes any opened database and releases the lock. Recovery from an initialization failure
requires reloading the document. Browsers without Web Locks fail closed; HTTPS or localhost is required.
Per-write locking alone cannot protect independent engine snapshots.

IndexedDB version 5 provides a transition barrier: legacy version 4 connections prevent the new client from
opening storage, and legacy clients requesting version 4 cannot reopen after the upgrade. A blocked open fails
with instructions to save and close old tabs, then reload. Its uncancellable request aborts any late upgrade
and closes any late connection, so it cannot migrate or expose snapshots after releasing ownership.
The schema upgrade preserves existing stores and data; subsequent epoch reconciliation can intentionally clear
data as described in [Build Identity and Storage Resets](./docs/DEPLOYMENT.md#build-identity-and-storage-resets).

Storage belongs to the site origin (scheme, hostname, and port). Deployments under different paths on the same
origin share the database and ownership lock in the same storage partition; moving to a different origin uses separate storage.

### Web Locks Guarantee Boundaries

Web Locks provides cooperative exclusion for participants requesting the same name in the same storage bucket.
It does not stop code that writes IndexedDB without requesting the lock, or a caller using the API's `steal`
option. The version 5 barrier excludes the known legacy clients that explicitly request version 4; it is not
a general permission boundary for arbitrary scripts. Separate browser profiles or storage partitions do not
share ownership. All current filesystem access must go through the guarded adapter.

A granted lock remains held while its callback promise is pending unless the browser terminates its agent or
another caller steals it. This excludes competing participating snapshots; it does not guarantee disk durability,
save completion before tab closure, or survival of crashes, browser eviction, or power loss. Pending-write flush
and atomic IndexedDB transactions address different parts of save safety.

References: [Web Locks specification](https://www.w3.org/TR/web-locks/) and
[IndexedDB specification](https://www.w3.org/TR/IndexedDB/).
