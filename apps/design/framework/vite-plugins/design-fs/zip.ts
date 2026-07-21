import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveContentPath } from './paths'

type ZipEntry = {
  name: string
  data: Buffer
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]!
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n, 0)
  return b
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n, 0)
  return b
}

/** Build an uncompressed (STORE) ZIP buffer from named file entries. */
export function createStoredZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      entry.data,
    ])
    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ])
    localParts.push(localHeader)
    centralParts.push(centralHeader)
    offset += localHeader.length
  }

  const central = Buffer.concat(centralParts)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ])

  return Buffer.concat([...localParts, central, end])
}

async function walkFiles(root: string, dir: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = []
  const names = await fs.readdir(dir, { withFileTypes: true })
  for (const ent of names) {
    if (ent.name === '.DS_Store') continue
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      entries.push(...(await walkFiles(root, abs)))
      continue
    }
    if (!ent.isFile()) continue
    const rel = path.relative(root, abs).split(path.sep).join('/')
    entries.push({ name: rel, data: await fs.readFile(abs) })
  }
  return entries
}

export async function zipDirectory(dir: string): Promise<Buffer> {
  const root = path.resolve(dir)
  const entries = await walkFiles(root, root)
  if (entries.length === 0) {
    throw new Error('Package is empty')
  }
  return createStoredZip(entries)
}

export async function zipPackageUnderRoot(
  assetsRoot: string,
  kind: string,
  id: string,
): Promise<Buffer> {
  const dir = resolveContentPath(assetsRoot, kind, id)
  return zipDirectory(dir)
}
