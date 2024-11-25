## Obebel

High-level .js/.ts/.d.ts builder API by sitting on top of Babel's tooling.

Uses a simpler mental model than the comprehensive set of nodes in a normal AST representation.

In Forge, you work with scopes which act similar to scopes for variables. After creating the API, you get the ability to do top-level things (like setting up imports) but also a `rootScope` which lets you declare things like types, interfaces, constants and functions.

Creating something like a function, will create a new scope (as well as providing functions for setting up uour function) making for some readable imperitive code for describing how to create a file.

The outcome is a Babel AST, which can be converted into a string, and ran with prettier to make pretty.

## Focus for this project

- [x] Have a good API for .d.ts files
- [ ] Have a good API for .ts files
- [ ] Have a good API for creating JSX components

## Goals

I want a good builder for .d.ts files I have scattered around in projects, and I want a good tool for generating source files to use in generating template files for puzzmo.com

## Examples

### Making a .d.ts

```ts
import { createSourceFile } from "@puzzmo-com/obebel"

const dts = createSourceFile({})

dts.setImport("React", { subImports: ["useState"] })

dts.rootScope.addInterface(
  "Props",
  [
    {
      name: "disabled",
      type: "boolean",
      optional: true,
    },
  ],
  { exported: true },
)

const code = forge.getResult()
```

### Making a React component

```ts
import { createSourceFile } from "@puzzmo-com/obebel"

const tsx = createSourceFile({})

tsx.setImport("React", { subImports: ["useState"] })

tsx.rootScope.addInterface(
  "Props",
  [
    {
      name: "disabled",
      type: "boolean",
      optional: true,
    },
  ],
  { exported: true },
)

const component = tsx.rootScope.addFunction("MyComponent")
component.addParam("props", "Props")
component.scope.addVariableDeclaration()

// TODO: JSX
```

## Contributing

For now, this repo is an open source project which is pulled directly from the puzzmo.com codebase, so OSS contributions need be merged upstream and then come down.
