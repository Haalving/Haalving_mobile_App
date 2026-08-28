# Why `react` is mapped in tsconfig

The console is React 19. The client app is React 18.3 — the pair Expo SDK 52
ships. Both live in one pnpm workspace.

`next` declares `@types/react` as an **optional** peer, so pnpm links no copy
into its own directory; Next's `.d.ts` files resolve `react` by walking up into
pnpm's hoist area (`node_modules/.pnpm/node_modules`), where the copy that
happens to sit is mobile's **18.3**.

TypeScript then had two React type trees in one program, and the errors named no
mistake anyone had made:

```
Type '.../@types+react@19.2.18/...'.ReactNode is not assignable to 'React.ReactNode'
'Suspense' cannot be used as a JSX component
Type '{ children: ReactNode }' does not satisfy the constraint 'LayoutProps'
```

## The fix

`paths` in `web/tsconfig.json` maps `react` and `react-dom` **type** resolution
to this package's own `@types`, for every file in the program — Next's `.d.ts`
files included. There is no emit (`noEmit: true`), so nothing at runtime is
affected; the bundler resolves the real packages as it always did.

`pnpm-workspace.yaml` also carries `next>@types/react: ^19.0.7`. That is kept as
the declaration of intent, but it does **not** do the work on its own: pnpm bakes
a package's peer set into its store path, and an optional peer it never linked
cannot be overridden into existence.

## When to delete this

Both entries go when the two apps agree on a React major — the Expo SDK that
ships React 19. At that point remove the `react`/`react-dom` `paths`, the
override, and this file.
