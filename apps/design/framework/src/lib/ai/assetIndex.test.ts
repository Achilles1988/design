import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { compactForPrompt, parseIndexMarkdown, type AssetMeta } from './assetIndex'

const SAMPLE = `# 设计风格索引（自动生成，勿手改）

> 由脚本生成

共 3 个风格。列：目录 | 标题 | 摘要 | 标签 | 来源 | 预览。

| dir | title | summary | tags | origin | preview |
| --- | --- | --- | --- | --- | --- |
| \`neon\` | Design System Inspired by Neon | Electric neon glow effects. | spec | open-design | Y |
| \`apple\` | Apple-design-analysis | Photography-first premium white space… | spec | awesome-design-md |  |
| \`sidebar-shell\` | Sidebar Shell | 左侧固定导航 + 顶栏 + 主内容区滚动 | layout | manual | Y |
`

describe('parseIndexMarkdown', () => {
  it('parses id/title/summary/tags/origin/hasPreview', () => {
    const items = parseIndexMarkdown(SAMPLE)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual<AssetMeta>({
      id: 'neon',
      title: 'Design System Inspired by Neon',
      summary: 'Electric neon glow effects.',
      tags: ['spec'],
      origin: 'open-design',
      hasPreview: true,
    })
    expect(items[1]!.hasPreview).toBe(false)
    expect(items[2]!.tags).toEqual(['layout'])
    expect(items[2]!.origin).toBe('manual')
  })

  it('splits comma-separated tags', () => {
    const src = `| dir | title | summary | tags | origin | preview |
| --- | --- | --- | --- | --- | --- |
| \`x\` | X | foo | spec, ui | manual | Y |
`
    const [item] = parseIndexMarkdown(src)
    expect(item!.tags).toEqual(['spec', 'ui'])
  })

  it('returns empty array when no table', () => {
    expect(parseIndexMarkdown('# empty')).toEqual([])
  })

  it('skips rows with fewer than 6 columns', () => {
    const src = `| dir | title | summary | tags | origin | preview |
| --- | --- | --- | --- | --- | --- |
| \`bad\` | broken row |
| \`good\` | Good | s | spec | manual | Y |
`
    const items = parseIndexMarkdown(src)
    expect(items.map((i) => i.id)).toEqual(['good'])
  })
})

describe('compactForPrompt', () => {
  const items: AssetMeta[] = Array.from({ length: 90 }, (_, i) => ({
    id: `id-${i}`,
    title: `Title ${i}`,
    summary: 'a'.repeat(120),
    tags: ['spec'],
    origin: 'open-design',
    hasPreview: true,
  }))

  it('truncates summary to <=60 chars', () => {
    const out = compactForPrompt(items.slice(0, 1))
    const line = out.split('\n')[0]!
    // extract summary field (between last two ' | ')
    const parts = line.split(' | ')
    expect(parts[parts.length - 1]!.length).toBeLessThanOrEqual(60)
  })

  it('caps at limit and appends overflow hint', () => {
    const out = compactForPrompt(items, 40)
    const lines = out.trim().split('\n')
    expect(lines).toHaveLength(41) // 40 rows + overflow line
    expect(lines[lines.length - 1]).toBe('… still 50 items match')
  })

  it('omits overflow line when under limit', () => {
    const out = compactForPrompt(items.slice(0, 5), 40)
    expect(out).not.toContain('still')
    expect(out.trim().split('\n')).toHaveLength(5)
  })
})

describe('published asset indexes', () => {
  it('publishes metadata for every layout package', async () => {
    const layoutsUrl = new URL('../../../public/assets/layoutmd/', import.meta.url)
    const indexUrl = new URL(
      'INDEX.md',
      layoutsUrl,
    )
    const items = parseIndexMarkdown(await readFile(indexUrl, 'utf8'))
    const packageIds = (await readdir(layoutsUrl, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(items).toHaveLength(21)
    expect(items.map((item) => item.id).sort()).toEqual(packageIds)
    expect(items.every((item) => item.tags.length > 1)).toBe(true)
  })
})
