import { createSourceFile } from "../obebel"

it("creates a function", () => {
  const dts = createSourceFile({})
  dts.setImport("React", { subImports: ["useState"] })

  const code = dts.getResult()
  expect(code).toMatchInlineSnapshot(`"import { useState } from "React";"`)
})

it("edits an import", () => {
  const dts = createSourceFile({})
  dts.setImport("React", { mainImport: "React" })
  dts.setImport("React", { subImports: ["useState"] })

  const code = dts.getResult()
  expect(code).toMatchInlineSnapshot(`"import React, { useState } from "React";"`)
})
