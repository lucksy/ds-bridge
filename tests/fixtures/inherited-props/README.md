Components that inherit compiled (`.d.ts`) HTML attribute types, like shadcn's
`React.ComponentProps<"button">`, plus a lower-case cva-style helper. The scanner
must keep only the props the project itself declares, and skip the helper.
