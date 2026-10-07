Vite/shadcn-shaped project: the root tsconfig only holds `references`, and the
`@/*` path alias lives in tsconfig.app.json. Used by the usage-mapper tests to
prove aliased imports (`@/components/ui/button`) resolve.
