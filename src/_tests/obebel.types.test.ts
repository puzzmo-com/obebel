import { createSourceFile } from "../obebel"

it("creates an interface", () => {
  const dts = createSourceFile({})
  dts.rootScope.addInterface("Props", [{ docs: "OK", name: "one", type: "string" }])

  const code = dts.getResult()
  expect(code).toMatchInlineSnapshot(`
    "interface Props {
      /* OK*/
      one: string;
    }"
  `)
})

it("creates a type", () => {
  const dts = createSourceFile({})
  // EZ
  dts.rootScope.addTypeAlias("Password", "string")
  // Requires AST parsing as its non-trivial
  dts.rootScope.addTypeAlias("Custom", "{ abc: string }")

  const code = dts.getResult()
  expect(code).toMatchInlineSnapshot(`
    "type Password = string;
    type Custom = {
      abc: string;
    };"
  `)
})
