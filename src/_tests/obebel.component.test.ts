import { createSourceFile } from "../obebel"

it("edits an import", () => {
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
  component.addReturn("<div>Hello</div>")

  const code = tsx.getResult()
  expect(code).toMatchInlineSnapshot(`
    "import { useState } from "React";
    export interface Props {
      disabled?: boolean;
    }
    const MyComponent = (props: Props) => {
      return <div>Hello</div>;
    };"
  `)
})
