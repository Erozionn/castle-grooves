import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { transformSync } from '@babel/core'

test('Babel resolves aliases with glob roots using the patched Glob dependency', () => {
  const result = transformSync('import value from "@utils/utilities"', {
    filename: path.resolve('scripts/smoke.js'),
    configFile: false,
    babelrc: false,
    plugins: [[require.resolve('babel-plugin-module-resolver'), {
      root: ['./{utils,dashboard}'],
      alias: { '@utils': './utils' },
    }]],
  })
  assert.ok(result?.code?.includes('../utils/utilities'))
})
