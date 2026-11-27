# Ark of Atrahasis

Ark gives an SES compartment a DOM API for rendering inside an exclusive, host-owned iframe. Create one domain per plugin in the host realm. Give the guest a mount handle. The host owns the iframe, its resource policy, and its lifetime. The host manages mount roots and keeps guest-created elements, including controls, free of foreign shadow roots and unowned nodes.

```ts
import { createSafeDomain } from "ark-of-atrahasis";

// frame is a loaded, host-owned <iframe sandbox="allow-same-origin">.
const document = frame.contentDocument!;
const domain = createSafeDomain(document);
const sidebar = domain.mount(document.querySelector("#sidebar")!);
const main = domain.mount(document.querySelector("#main")!);

const button = sidebar.createButton();
button.setText("Refresh");
button.onClick(() => refresh());
sidebar.appendChild(button);
main.appendChild(button); // Moves the same node and its listener.
sidebar.dispose();        // Releases this root. The button remains live.
domain.dispose();         // Removes mounted nodes, listeners and stylesheets.
```

Mount a connected element or shadow root. Mount handles have tree operations and semantic factories. Factories return detached nodes. Use `detach()` to keep a node for reuse and `dispose()` to revoke it and its owned descendants. A released root can be mounted again. For a single mount, `createSafeDocument(root, options)` creates a private domain and disposes it with the handle.

IDs, names, label references and CSS selectors use native document semantics. Aliases in the same document share that namespace. Moving an owned node beneath an unowned element makes it ineligible for guest operations and event projection. Hosts should keep mount roots under their control.

## Host policy

URL sinks default to denied. Grant individual sinks with a host-selected base and explicit origins.

```ts
const domain = createSafeDomain(document, {
  urlPolicy: {
    baseURL: "https://assets.example/ui/",
    sinks: { "image.src": { allowedOrigins: ["https://assets.example"] } },
  },
  stylePolicy: { allowedProperties: ["display", "color", "fontFamily"] },
});
```

The default inline style policy grants the safe property catalog. Read, write and remove declarations through `node.style.get`, `set` and `remove`. A rejected write returns false. Use `{ denyAll: true }` to disable inline styles. Full stylesheets require `allowStylesheet: true`. **Enable this only after the host enforces a resource CSP in the iframe that blocks unauthorized external CSS resources.** The sandbox attribute alone does not enforce a resource policy. Document-level sheets apply across mount aliases. Shadow-root sheets live inside their mount.

Safe form controls are enabled by default. Set `allowFormControls: false` to disable their factories. Image URL grants are independent. Run SES lockdown before handing capabilities to a compartment. Ark uses the ambient SES hardener when available and otherwise recursively freezes its facades. The host may supply a trusted recursive `harden` function.

## Entry points and migration from 0.3.1

- Import `createSafeDocument`, `createSafeDomain`, the two policy compilers and `isSafeDOMError` from `ark-of-atrahasis`. Pass a root object instead of a string ID. Errors are frozen records with a code, message and operation.
- Worker bridges and compilers import the DOM-free catalogs, primitive validators, `validateFactory` and `validStyle` from `ark-of-atrahasis/validators`. Kaede can use a factory mount and one mount per alias in the same domain. Only trusted host code should import `getRealNode(domain, wrapper)` from `ark-of-atrahasis/host`.
- Decagrammaton should emit `createParagraph()` for paragraphs and `createTextNode()` for raw text. Convert static HTML attributes in `Decagrammaton::genAttr()`, including boolean presence and numeric literals. Pass primitive values of the declared type through the worker bridge. Read back browser-normalized control values with `getValue()`.
- Replace direct style assignments with `style.set(property, value)`. Register events with the named methods or `addEventListener(type, handler, options)`. Targets are readonly snapshots. The three native event actions remain available only during synchronous dispatch. Worker bridges can request cancellation or propagation control through boolean declarative options on registration.

Run `bun install` and `bun run check` to typecheck, build all three entry points and run the contract tests.
