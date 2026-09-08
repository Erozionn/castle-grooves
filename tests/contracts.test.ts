import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import SwaggerParser from '@apidevtools/swagger-parser'
import { fromFile, Parser } from '@asyncapi/parser'

test('OpenAPI and AsyncAPI contracts are valid', async () => {
  const openApi = path.resolve('contracts/openapi.yaml')
  const asyncApi = path.resolve('contracts/asyncapi.yaml')
  await SwaggerParser.validate(openApi)

  const parser = new Parser()
  const diagnostics = await fromFile(parser, asyncApi).validate()
  assert.equal(diagnostics.filter((diagnostic) => diagnostic.severity === 0).length, 0)
})
