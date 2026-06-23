import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCluster, clusterTotal, isUnbroken, meetsTarget } from './pullups.js'

test('parseCluster: splits on +, tolerant of spaces, drops junk', () => {
  assert.deepEqual(parseCluster('6+4'), [6, 4])
  assert.deepEqual(parseCluster('7 + 3'), [7, 3])
  assert.deepEqual(parseCluster('10'), [10])
  assert.deepEqual(parseCluster(''), [])
  assert.deepEqual(parseCluster('6+0+x'), [6])
})

test('clusterTotal sums the parts', () => {
  assert.equal(clusterTotal('6+4'), 10)
  assert.equal(clusterTotal('8+2+1'), 11)
  assert.equal(clusterTotal(''), 0)
})

test('isUnbroken: single cluster only', () => {
  assert.equal(isUnbroken('10'), true)
  assert.equal(isUnbroken('6+4'), false)
  assert.equal(isUnbroken(''), false)
})

test('meetsTarget: total vs difficulty target', () => {
  assert.equal(meetsTarget('6+4', 10), true)
  assert.equal(meetsTarget('7+2', 10), false)
  assert.equal(meetsTarget('10', 10), true)
})
