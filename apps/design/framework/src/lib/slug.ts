export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isValidAppId(id: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(id)
}
