// TODO:
//  - Port tests from burr fork
//
import generator from "@babel/generator"
import { parse, parseExpression } from "@babel/parser"
import traverse from "@babel/traverse"
import * as t from "@babel/types"

interface InterfaceProperty {
  docs?: string
  name: string
  optional?: boolean
  type: string
}

interface InterfaceCallSignature {
  docs?: string
  params: { name: string; optional?: boolean; type: string }[]
  returnType: string
  type: "call-signature"
}

interface NodeConfig {
  docs?: string
  exported?: boolean
  generics?: { name: string }[]
}

/** Main entrypoint to  */
export const createSourceFile = (opts: {}) => {
  const sourceFile = parse("", { sourceType: "module", plugins: ["jsx", "typescript"] })

  /** Declares an import which should exist in the source document */
  const setImport = (source: string, opts: { mainImport?: string; subImports?: string[] }) => {
    const imports = sourceFile.program.body.filter((s) => s.type === "ImportDeclaration")

    const existing = imports.find((i) => i.source.value === source)
    if (!existing) {
      const imports = [] as (t.ImportSpecifier | t.ImportDefaultSpecifier)[]
      if (opts.mainImport) {
        imports.push(t.importDefaultSpecifier(t.identifier(opts.mainImport)))
      }

      if (opts.subImports) {
        imports.push(...opts.subImports.map((si) => t.importSpecifier(t.identifier(si), t.identifier(si))))
      }

      const importDeclaration = t.importDeclaration(imports, t.stringLiteral(source))
      let lastIndex = 0
      for (const statement of sourceFile.program.body) {
        if (t.isImportOrExportDeclaration(statement)) lastIndex = sourceFile.program.body.indexOf(statement)
      }

      sourceFile.program.body.splice(lastIndex, 0, importDeclaration)
      return
    }

    if (!existing.specifiers.find((f) => f.type === "ImportDefaultSpecifier") && opts.mainImport) {
      existing.specifiers.push(t.importDefaultSpecifier(t.identifier(opts.mainImport)))
    }

    if (opts.subImports) {
      const existingImports = existing.specifiers.map((e) => e.local.name)
      const newImports = opts.subImports.filter((si) => !existingImports.includes(si))

      if (newImports.length) {
        existing.specifiers.push(...newImports.map((si) => t.importSpecifier(t.identifier(si), t.identifier(si))))
      }
    }
  }

  /** Allows creating a type alias via an AST parsed string */
  const setTypeViaTemplate = (template: string) => {
    const type = parse(template, { sourceType: "module", plugins: ["jsx", "typescript"] })

    const typeDeclaration = type.program.body.find((s) => s.type === "TSTypeAliasDeclaration")
    if (!typeDeclaration) throw new Error("No type declaration found in template: " + template)

    const oldTypeDeclaration = sourceFile.program.body.find(
      (s) => s.type === "TSTypeAliasDeclaration" && s.id.name === typeDeclaration.id.name,
    )
    if (!oldTypeDeclaration) {
      sourceFile.program.body.push(typeDeclaration)
      return
    }

    if (!t.isTSTypeAliasDeclaration(oldTypeDeclaration)) throw new Error("Expected TSTypeAliasDeclaration")

    const newAnnotion = typeDeclaration.typeAnnotation

    // is literal primitive
    if (newAnnotion.type.endsWith("LiteralTypeAnnotation")) {
      oldTypeDeclaration.typeAnnotation = newAnnotion
      return
    }

    if (t.isTSTypeLiteral(newAnnotion) && t.isTSTypeLiteral(oldTypeDeclaration.typeAnnotation)) {
      for (const field of newAnnotion.members) {
        const matchingOnOld = oldTypeDeclaration.typeAnnotation.members.find((mm) => {
          if (!t.isTSPropertySignature(mm) || !t.isTSPropertySignature(field)) return false
          if (!t.isIdentifier(mm.key) || !t.isIdentifier(field.key)) return false
          return mm.key.name === field.key.name
        })

        if (matchingOnOld) {
          matchingOnOld.typeAnnotation = field.typeAnnotation
        } else {
          oldTypeDeclaration.typeAnnotation.members.push(field)
        }
      }

      return
    }

    const code = generator(typeDeclaration as any).code
    throw new Error(`Unsupported type annotation: ${newAnnotion.type} - ${code}`)
  }

  /** An internal API for describing a new area for inputting template info */
  const createScope = (scopeName: string, scopeNode: t.Node, statements: t.Statement[]) => {
    const addFunction = (name: string) => {
      let functionNode = statements.find(
        (s) => t.isVariableDeclaration(s) && t.isIdentifier(s.declarations[0].id) && s.declarations[0].id.name === name,
      ) as t.VariableDeclaration | undefined

      if (!functionNode) {
        functionNode = t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier(name), t.arrowFunctionExpression([], t.blockStatement([]))),
        ])
        statements.push(functionNode)
      }

      const arrowFn = functionNode.declarations[0].init as t.ArrowFunctionExpression
      if (!t.isArrowFunctionExpression(arrowFn)) throw new Error(`Expected an ArrowFunctionExpression when making ${scopeName}`)
      if (!t.isBlock(arrowFn.body)) throw new Error(`Expected arrow fn's body to have many statements when making ${scopeName}`)

      const fnStatements = arrowFn.body.body

      return {
        node: arrowFn,
        addParam: (name: string, type: string) => {
          const param = t.identifier(name)

          const fromParse = getTypeLevelAST(type)
          param.typeAnnotation = t.tsTypeAnnotation(fromParse)

          const exists = arrowFn.params.find((p) => p.type === "Identifier" && p.name === name)
          if (!exists) arrowFn.params.push(param)
          else exists.typeAnnotation = param.typeAnnotation
        },

        addReturn: (expression: t.Expression | string) => {
          const exp =
            typeof expression === "string"
              ? parseExpression(expression, { sourceType: "module", plugins: ["jsx", "typescript"] })
              : expression
          fnStatements.push(t.returnStatement(exp))
        },

        scope: createScope(name, arrowFn, (arrowFn.body as t.BlockStatement).body),
      }
    }

    const addVariableDeclaration = (name: string, add: (prior: t.Expression | undefined) => t.Expression) => {
      const prior = statements.find(
        (b) => t.isVariableDeclaration(b) && t.isIdentifier(b.declarations[0].id) && b.declarations[0].id.name === name,
      )

      if (prior && t.isVariableDeclaration(prior) && t.isVariableDeclarator(prior.declarations[0]) && prior.declarations[0].init) {
        prior.declarations[0].init = add(prior.declarations[0].init)
        return
      }

      const declaration = t.variableDeclaration("const", [t.variableDeclarator(t.identifier(name), add(undefined))])
      statements.push(declaration)
    }

    const addTypeAlias = (name: string, type: KnownTypes, nodeConfig?: NodeConfig) => {
      const prior = statements.find(
        (s) =>
          (t.isTSTypeAliasDeclaration(s) && s.id.name === name) ||
          (t.isExportNamedDeclaration(s) && t.isTSTypeAliasDeclaration(s.declaration) && s.declaration.id.name === name),
      )
      if (prior) return

      const typeNode = typeStringRef(type)

      if (!typeNode) throw new Error(`Could not generate node for type alias with "${type}"`)

      const alias = t.tsTypeAliasDeclaration(t.identifier(name), null, typeNode!)
      const statement = nodeFromNodeConfig(alias, nodeConfig)
      statements.push(statement)

      return alias
    }

    const addInterface = (name: string, fields: (InterfaceCallSignature | InterfaceProperty)[], nodeConfig?: NodeConfig) => {
      const prior = statements.find(
        (s) =>
          (t.isTSInterfaceDeclaration(s) && s.id.name === name) ||
          (t.isExportNamedDeclaration(s) && t.isTSInterfaceDeclaration(s.declaration) && s.declaration.id.name === name),
      )

      if (prior) {
        if (t.isTSInterfaceDeclaration(prior)) return prior
        if (t.isExportNamedDeclaration(prior) && t.isTSInterfaceDeclaration(prior.declaration)) return prior.declaration
        throw new Error("Unknown state")
      }

      const body = t.tsInterfaceBody(
        fields.map((f) => {
          // Allow call signatures
          if (!("name" in f) && f.type === "call-signature") {
            const sig = t.tsCallSignatureDeclaration(
              null, // generics
              f.params.map((p) => {
                const i = t.identifier(p.name)
                i.typeAnnotation = t.tsTypeAnnotation(t.tsTypeReference(t.identifier(p.type)))
                if (p.optional) i.optional = true
                return i
              }),
              t.tsTypeAnnotation(t.tsTypeReference(t.identifier(f.returnType))),
            )
            return sig
          } else {
            const prop = t.tsPropertySignature(t.identifier(f.name), t.tsTypeAnnotation(t.tsTypeReference(t.identifier(f.type))))
            prop.optional = f.optional
            if (f.docs?.length) t.addComment(prop, "leading", " " + f.docs)
            return prop
          }
        }),
      )

      const interfaceDec = t.tsInterfaceDeclaration(t.identifier(name), null, null, body)
      const statement = nodeFromNodeConfig(interfaceDec, nodeConfig)
      statements.push(statement)
      return interfaceDec
    }

    const addLeadingComment = (comment: string) => {
      const firstStatement = statements[0] || scopeNode
      if (firstStatement) {
        if (firstStatement.leadingComments?.find((c) => c.value === comment)) return
        t.addComment(firstStatement, "leading", comment)
      } else {
        t.addComment(scopeNode, "leading", comment)
      }
    }

    return {
      addFunction,
      addVariableDeclaration,
      addTypeAlias,
      addInterface,
      addLeadingComment,
    }
  }

  /** Experimental function for parsing out a graphql template tag, and ensuring certain fields have been called */
  const updateGraphQLTemplateTag = (expression: t.Expression, path: string, modelFields: string[]) => {
    if (path !== ".") throw new Error("Only support updating the root of the graphql tag ATM")
    if (t.isSpreadElement(expression)) throw new Error("Can't run on a spread element")
    traverse(
      expression,
      {
        TaggedTemplateExpression(path) {
          const { tag, quasi } = path.node
          if (t.isIdentifier(tag) && tag.name === "graphql") {
            // This is the graphql query
            const query = quasi.quasis[0].value.raw
            const inner = query.match(/\{(.*)\}/)?.[1]
            if (inner === undefined) throw new Error("Could not find inner query")

            path.replaceWithSourceString(`graphql\`${query.replace(inner, `${inner}, ${modelFields.join(", ")}`)}\``)
            path.stop()
          }
        },
      },
      // Uh oh, not really sure what a Scope object does here
      {} as any,
    )
    return expression
  }

  const parseStatement = (code: string) =>
    parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] }).program.body[0] as t.ExpressionStatement

  const getResult = (): string => generator(sourceFile.program, {}).code

  const rootScope = createScope("root", sourceFile, sourceFile.program.body)
  return { setImport, getResult, setTypeViaTemplate, parseStatement, updateGraphQLTemplateTag, rootScope }
}

/** Parses something as though it is in type-space and extracts the subset of the AST that the string represents  */
const getTypeLevelAST = (type: string) => {
  const typeAST = parse(`type A = ${type}`, { sourceType: "module", plugins: ["jsx", "typescript"] })
  const typeDeclaration = typeAST.program.body.find((s) => t.isTSTypeAliasDeclaration(s))
  if (!typeDeclaration) throw new Error("No type declaration found in template: " + type)
  return typeDeclaration.typeAnnotation
}

export type ForgeType = ReturnType<typeof createSourceFile>

/** A little helper to handle all the extras   */
const nodeFromNodeConfig = <T extends t.Declaration & { typeParameters?: t.TSTypeParameterDeclaration | null }>(
  node: T,
  nodeConfig?: NodeConfig,
) => {
  const statement = nodeConfig?.exported ? t.exportNamedDeclaration(node) : node
  if (nodeConfig?.docs) t.addComment(statement, "leading", nodeConfig.docs)
  if (nodeConfig?.generics && nodeConfig.generics.length > 0) {
    node.typeParameters = t.tsTypeParameterDeclaration(nodeConfig.generics.map((g) => t.tsTypeParameter(null, null, g.name)))
  }

  return statement
}

type KnownTypes = "any" | "string" | "number" | (string & {}) | t.TSType
const typeStringRef = (type: KnownTypes) => {
  if (typeof type !== "string") return type
  // Allow having some easy literals
  let typeNode = null

  if (type === "any") typeNode = t.tsAnyKeyword()
  if (type === "string") typeNode = t.tsStringKeyword()
  if (type === "number") typeNode = t.tsNumberKeyword()
  if (!typeNode) typeNode = getTypeLevelAST(type)

  return typeNode
}
