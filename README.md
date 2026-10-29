# BuildBench — Virtual PC Assembly Lab

A browser-based Three.js lab for learning how a typical ATX desktop computer fits together: explore a finished PC, assemble one from an empty workbench by dragging parts onto their mounts, and check parts against three documented compatibility rules.

The inherited project this repository builds on was titled "Inside the PC" (see [Credits and project origins](#credits-and-project-origins)). The internal npm package name is still `inside-pc-lab`; it is not shown in the application and has not been changed.

## Run locally

Requires Node.js 22.18 or newer (the `engines` field in `package.json`). The `test` script uses `module.registerHooks` (added in Node.js 22.15; see `tests/register.mjs`) and runs TypeScript files directly through Node's built-in type stripping (enabled by default from Node.js 22.18). Node.js 24 is recommended; the project was developed and tested on Node.js 24.22.1.

```sh
npm install
npm run dev
```

Open the local URL printed by the development server (`http://localhost:3000` by default). The app is a Next.js project with a Three.js scene loaded on the client. Fonts, geometry and all textures are included in the build; the model does not download external 3D assets.

## Technology stack

- **Framework:** Next.js 16.4.3 (App Router; Turbopack is used for `npm run dev` and `npm run build`).
- **Language and UI:** TypeScript 5.9.3 (strict mode), React 19.2.6, shadcn-style components in `components/ui/` (most of them built on Base UI), and lucide-react icons.
- **3D:** three 0.185, loaded on the client only.
- **Styling:** Tailwind CSS 4.2.1 (through `@tailwindcss/postcss`) plus a hand-written global stylesheet, `app/globals.css`, which holds the Blueprint Bench design tokens (palette, spacing and the type scale). Text is set in Geist Sans, with Geist Mono for technical values, loaded through `next/font`.
- **Tooling:** oxlint (`npm run lint`), oxfmt (`npm run format`) and Node's built-in test runner (`node:test`).
- **Deployment:** configured for Vercel as a Next.js app (`vercel.json`). `vite.config.ts`, `.openai/hosting.json` and the `vinext`, `vite`, `wrangler` and Cloudflare packages are still in the repository but are not used by any npm script.

## Explore

- Drag to orbit; right-drag to pan; scroll or pinch to zoom.
- Select a component in the model or component list to read its role and connections.
- Isolate any component to examine it from every side.
- Remove and reinstall parts individually, or spread out the complete assembly with the spacing slider.
- Start guided disassembly for a nine-step sequence, leaving the chassis as the final structure.
- Show labels, hide individual parts, choose front/side camera views, or enter focus mode for projection.
- Keyboard: R resets, L toggles labels, Escape exits isolation/focus. Focus the canvas for arrow-key panning and +/− zoom.

The 10 component groups are the chassis, side panel, motherboard, CPU, CPU cooler, RAM pair, graphics card, NVMe SSD, PSU and front fan pair. It is a generic teaching model, not a manufacturer-specific CAD assembly. Cables and fasteners are simplified and the connections are not a physical repair procedure.

## Build

Choose **Build** in the header. The workspace starts **empty**: no part is drawn in the 3D view and progress reads 0 / 10. All ten parts wait in the parts tray, in assembly order.

- **Order is enforced.** A part can be installed only when the parts it sits in or on are already installed: the chassis comes first, the CPU needs the motherboard, the CPU cooler needs the CPU, and so on. Locked cards say what they still need. The next part is marked NEXT, and an assembly rail with one segment per part shows what is installed, what is next and what remains.
- **Drag the real 3D part.** Drag a ready card (with a mouse or a finger) into the 3D view. The actual model follows the pointer and the part's mount highlights: blue while you search, green when you are over the correct mount, and a red flash if you let go elsewhere. Releasing over the mount installs the part.
- **A missed drop is recoverable.** Releasing the part elsewhere in the workspace leaves it **loose**: it stays where you let go, is marked Loose, is not installed and is not counted in progress. Pick it up again in the 3D view, or from its tray card, and retry. Releasing outside the workspace, or pressing Escape, cancels the drag.
- **Other ways to install.** Every ready card has an Install button, and the inspector offers the same action. Removing an installed part also removes anything that sits on it (never the chassis). Reset starts the build again, and R resets from the keyboard.
- **Installation guidance.** Select any part, installed or not, and the inspector shows where it belongs (its mount), which prerequisites are installed or still missing, whether the part is in the tray, loose in the workspace or installed, and what to do next. Specifications in the inspector describe illustrative hardware.
- **Finishing.** When all ten parts are installed the dock reports "PC assembled!" and offers to build again or to explore the finished PC.

## Compatibility checker

Choose **Compatibility** in the header's mode navigation to check a CPU, motherboard, RAM kit and case against three documented rules. Each rule reports `PASSED`, `FAILED` or `UNVERIFIED` with an explanation and the evidence it used.

1. **CPU–motherboard:** the CPU socket matches the motherboard socket.
2. **RAM–motherboard:** the memory type (DDR4 or DDR5) matches the motherboard.
3. **Motherboard–case:** the case lists the board's form factor and, where the manufacturer documents a maximum board width for that form factor (for example E-ATX), the board fits within it.

The overall result is "All 3 checked rules passed", "At least one checked rule failed" or "Some checks could not be confirmed". Passing means only that these three rules passed; it does not guarantee that the whole build is compatible. BIOS or chipset support, CPU memory-controller limits, memory speed or capacity, cooler height, graphics card length, power supply and storage are not checked.

Product specifications live in `lib/compatibility-catalogue.ts`, separate from the generic 3D model data. Each real product cites its official manufacturer page or document and the date it was read. A value that could not be confirmed is left undefined, which gives `UNVERIFIED` and is never assumed to pass. Two entries marked "Demo" are illustrative, are not manufacturer-verified, and exist to demonstrate `UNVERIFIED`. Manufacturer pages can change, so check the cited source before relying on a value.

The screen has two panels. The **Parts bench** holds the four selectors, each product's documented specifications as compact chips, its source links and the demo markers. The **Compatibility report** shows the overall result, a rule map (the motherboard at the centre, with each of the three relationships shown by its status in words, an icon and the line style) and the three rule cards. The map repeats what the cards say and is hidden from assistive technology, so the announcement of a result is the one the cards give.

## Responsive layout and touch

- **1200 px and wider:** the component library or parts tray on the left, the flexible 3D view in the middle and the inspector on the right. **900–1199 px** keeps three columns with narrower side panels.
- **640–899 px:** the 3D view takes the full width at a fixed height, with the library or tray as one sideways-scrolling strip under it and the inspector below.
- **Below 640 px:** the 3D view comes first, followed by Parts and Details tabs that share the space under it. The view is sized so that the view, the tabs and the strip fit on one screen once the header has scrolled away, so a part can be dragged from the strip into the view.
- **A phone on its side** (short landscape, 780 px or wider) uses a compact three-column layout; narrower short landscape screens use the stacked layout with a taller view.
- The 3D view keeps the same size when a selection, a tab or the tray changes, and its height is set in `svh` units so that a phone's address bar showing or hiding does not resize it and re-frame the camera.
- **Touch:** ready tray cards use `touch-action: pan-x` in the strip and `pan-y` in a vertical list. Swiping along the tray scrolls it, and moving across it starts a drag of the real 3D part; a drag only begins once the finger has moved across the tray's scroll axis. The 3D view uses `touch-action: none`, so one finger orbits and two fingers pinch, and the page is scrolled from the tray, the tabs or the header. A drag disables camera orbit for its whole duration, and a cancelled gesture leaves nothing loose or installed.
- Touch targets are at least 40 px on touch screens (32–36 px in short landscape). The layout uses `viewport-fit=cover` with safe-area insets, and pinch zoom of the page is not disabled.

**Testing status.** The layouts and the touch behaviour were exercised in headless Chrome with DevTools device and touch emulation, which sends real touch events through Chrome's input pipeline (swipes, drags, cancelled gestures, pinch) at widths from 320 to 1920 px. This is **emulation, not a test on a physical phone or tablet: no physical-device testing has been done.** Behaviour on real hardware is unverified, in particular iOS Safari, genuine inertial scrolling and multi-finger accuracy, the real address-bar behaviour that the `svh` sizing is meant to absorb, and iOS-only touch-callout handling.

## Implementation

- `lib/tower.ts`: procedural model, instanced details, material/label generation (inherited foundation).
- `lib/pc-scene-engine.ts`: lighting, shadows, picking, camera fitting, exploded assembly, drop-target display, dragging of parts and resource cleanup.
- `lib/components-data.ts`: teaching content, extraction dependencies and reinstallation rules.
- `lib/assembly.ts`: the Build assembly order, each part's install requirements and mount site, where a part currently is (tray, loose or installed) and what a drop means.
- `lib/drop-targets.ts`: pure geometry helpers for mount zones, drag placement and resting a released part on the workbench.
- `components/hardware-lab.tsx`: Explore, the responsive workbench and teaching interactions.
- `components/build-mode.tsx`: Build mode: the parts tray, pointer dragging from the tray and from the 3D scene, loose parts and the assembly dock.
- `components/pc-viewport.tsx`: the React wrapper around the Three.js scene.
- `components/app-header.tsx`: the BuildBench header and Explore / Build / Compatibility navigation shared by every mode, and the context strip under it. `app/page.tsx` owns which mode is shown.
- `components/viewport-toolbar.tsx`: the camera-view, zoom and labels row above the 3D canvas, shared by Explore and Build.
- `components/part-inspector.tsx`: the selected-part inspector shared by Explore and Build (identity and state, role, analogy, connections, specifications, the fact to remember, pinned actions).
- `components/install-guidance.tsx`: Build mode's installation guidance (mount site, prerequisites, location, next action), derived only from `lib/assembly.ts` and the build state.
- `components/panel-tabs.tsx`: the Parts / Details tab switch shown under the 3D view below 640px; `components/reveal-in-list.ts` scrolls a tray or library strip (sideways or vertically, never the page) to the selected item.
- `components/assembly-rail.tsx`: the segmented progress rail used for the Build assembly sequence and for Explore's guided disassembly. It keeps no progress state of its own.
- `lib/webmcp.ts`: optional, feature-detected agent tools for reading, inspection and assembly spacing.
- `lib/compatibility-catalogue.ts`: sourced CPU, motherboard, RAM and case data for the compatibility checker.
- `lib/compatibility.ts`: the three pure rule functions and the overall report logic; no React or Three.js.
- `components/compatibility-checker.tsx`: the checker screen.

Rendering requires WebGL 2 and hardware acceleration. An accessible explanation list remains available when WebGL cannot initialize. Reduced-motion preferences disable automatic rotation and smooth movement. The renderer pauses drawing when the scene is unchanged and caps its pixel ratio for classroom devices.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover guided and arbitrary assembly sequences, the Build order and prerequisite locks, what a drop means (only a ready part released over its own target installs; elsewhere it stays loose), mount-zone and drag-placement geometry, geometry integrity/picking tags, optional agent-tool input contracts, and the compatibility checker (each rule's passed, failed and unverified outcomes, missing data, width limits, overall status, catalogue integrity and the documented demonstration combinations).

`npm run lint` currently exits with errors: 31 errors and 1 warning across 17 files. None are in the compatibility checker or in the code added for the Build workflow's rules. They are accessibility-style, template-expression and unused-import findings in the inherited interface code (`components/hardware-lab.tsx`, `components/build-mode.tsx`, `components/pc-viewport.tsx`) and its `components/ui/` kit, plus three in `components/viewport-toolbar.tsx`, where the camera-control markup that Explore and Build each used to carry was consolidated.

Production build and route response are checked separately. Headless Chrome scripts that are not included in the repository exercised navigation between the three modes, the main Explore interactions, Build dragging (valid and invalid drops, loose-part recovery, Escape and Reset), the compatibility checker against every combination in the catalogue, and layouts from 320 to 1920 px; automated UI tests are not part of the repository. A supported browser WebMCP context was unavailable for live registry validation; optional tool contracts were checked in Node.

## Learning references

Component explanations were checked against [Intel’s PC assembly guide](https://www.intel.com/content/www/us/en/gaming/resources/how-to-build-a-gaming-pc.html). Example specifications in the 3D model describe fictional hardware and are not a compatibility or shopping list. The compatibility checker uses its own catalogue of real products with cited sources, described above.

## Credits and project origins

This repository builds on an existing project, and its Git history is the record of who wrote what.

**Inherited foundation.** The first five commits (`f925d93` to `4f4ac32`, 26 October 2026) are authored as `manish-terminal`. They are the working application this repository started from: the Next.js project and its tooling configuration, the Three.js 3D explorer and its procedural PC model (`lib/tower.ts`, `lib/pc-scene-engine.ts`, `lib/components-data.ts`), the Explore interface (`components/hardware-lab.tsx`, `components/pc-viewport.tsx`), an earlier version of Build mode (`components/build-mode.tsx`), the optional agent tools (`lib/webmcp.ts`), the `components/ui/` kit, an initial test file and the original README, titled "Inside the PC". The reference to Intel's PC assembly guide comes from that README.

**Added in this repository.** From 28 October 2026, commits by `Param-Anand-Kalita` (`ebbda34`, `cf363dc` and `01c4386`) added the rule-based compatibility checker with its sourced catalogue (`lib/compatibility.ts`, `lib/compatibility-catalogue.ts`, `components/compatibility-checker.tsx`) and the 3D assembly workflow: assembly order and locks, drop-target geometry and loose parts (`lib/assembly.ts`, `lib/drop-targets.ts`), together with a reworked pointer-driven Build mode, extensions to the scene engine, and their tests. The Blueprint Bench redesign and the BuildBench branding came after those commits: the shared header and navigation, the workspace layout, the redesigned parts tray and component library, the unified inspector with installation guidance, the assembly rail, the restyled compatibility checker and the responsive and touch behaviour. Several of these changes modify files that originate in the inherited foundation (`components/hardware-lab.tsx`, `components/build-mode.tsx`, `components/pc-viewport.tsx`, `lib/pc-scene-engine.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`), and those files remain derived from the inherited code.

**What this repository does not record.** There is no upstream remote and no source URL for the inherited commits. There is no LICENSE, NOTICE or AUTHORS file in the working tree or in any commit, and GitHub's metadata for this repository (checked on 29 October 2026) shows that it is not a fork and has no detected licence. A Git author name is not a verified identity, and two of the inherited commits carry a placeholder email address rather than a real one. Where the inherited code was first published, and on what terms, is therefore **not known from this repository**. Add the original source link here once it has been confirmed.

**Third-party software and references.** Next.js, React, three.js, Base UI, lucide-react, Tailwind CSS, the shadcn tooling behind the `components/ui/` files and the other dependencies listed in `package.json` remain under their own licences; see each package's licence file in `node_modules`. The Intel guide and Three.js are linked from the in-app teaching guide. Compatibility specifications are cited to the manufacturers' own pages in `lib/compatibility-catalogue.ts`, and product names belong to their owners.

## Licence status

**Unresolved.** This repository contains no licence file. No open-source licence has been added or assumed, and nothing in this README grants permission to copy, modify or redistribute the code: the credit above is attribution, not permission. This repository does not document the inherited code's author as having granted any licence or permission. Without a licence, others generally have no right to reuse code (this is general information, not legal advice).

Before the repository is redistributed or shared more widely, the licence and permission status of the inherited foundation should be confirmed with its author, and a licence for the whole work should be chosen by whoever holds the rights to it. The files added in this repository that stand alone are not derived from the inherited code, but every file listed above as modified from the inherited foundation is, so how it may be licensed depends on how the inherited code's terms are resolved.
