import test from 'node:test'
import assert from 'node:assert/strict'
import { spreadsheetText } from '../src/modules/housekeeping/exportReport.js'

test('spreadsheet exports neutralize formula-like user text', () => {
  assert.equal(spreadsheetText('=1+1'), "'=1+1")
  assert.equal(spreadsheetText('+1+1'), "'+1+1")
  assert.equal(spreadsheetText('-2+3'), "'-2+3")
  assert.equal(spreadsheetText('@SUM(A1:A2)'), "'@SUM(A1:A2)")
  assert.equal(spreadsheetText('Normal room note'), 'Normal room note')
})
