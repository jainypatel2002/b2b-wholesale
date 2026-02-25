import test from 'node:test'
import assert from 'node:assert/strict'
import { filterCategoryNodesForCategory, isCategoryNodeInCategory } from './category-node-utils'

type Node = {
    id: string
    category_id: string | null
    name: string
}

const nodes: Node[] = [
    { id: 'n-1', category_id: 'cat-a', name: 'A-1' },
    { id: 'n-2', category_id: 'cat-a', name: 'A-2' },
    { id: 'n-3', category_id: 'cat-b', name: 'B-1' },
    { id: 'n-4', category_id: null, name: 'Unknown' },
]

test('filterCategoryNodesForCategory returns only nodes for selected category', () => {
    const result = filterCategoryNodesForCategory(nodes, 'cat-a')
    assert.deepEqual(result.map(node => node.id), ['n-1', 'n-2'])
})

test('filterCategoryNodesForCategory returns empty array when category is missing', () => {
    assert.deepEqual(filterCategoryNodesForCategory(nodes, ''), [])
    assert.deepEqual(filterCategoryNodesForCategory(nodes, null), [])
})

test('filterCategoryNodesForCategory normalizes surrounding whitespace in ids', () => {
    const result = filterCategoryNodesForCategory(nodes, '  cat-b  ')
    assert.deepEqual(result.map(node => node.id), ['n-3'])
})

test('isCategoryNodeInCategory validates exact category membership', () => {
    assert.equal(isCategoryNodeInCategory(nodes[0], 'cat-a'), true)
    assert.equal(isCategoryNodeInCategory(nodes[0], 'cat-b'), false)
    assert.equal(isCategoryNodeInCategory(undefined, 'cat-a'), false)
    assert.equal(isCategoryNodeInCategory(nodes[0], ''), false)
})
