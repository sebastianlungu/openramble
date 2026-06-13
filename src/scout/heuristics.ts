import type { BrowserContext } from "../compiler/schema.js"

export function extractSearchTerms(ctx: BrowserContext): string[] {
  const terms = new Set<string>()

  const el = ctx.elementUnderCursor
  if (el?.textContent) {
    for (const token of splitTokens(el.textContent)) terms.add(token)
  }
  if (el?.ariaLabel) {
    for (const token of splitTokens(el.ariaLabel)) terms.add(token)
  }

  if (ctx.title) {
    for (const token of splitTokens(ctx.title)) terms.add(token)
  }

  if (ctx.accessibilitySnapshot) {
    const textNodes = extractTextFromA11y(ctx.accessibilitySnapshot)
    for (const node of textNodes) {
      for (const token of splitTokens(node)) terms.add(token)
    }
  }

  const results = Array.from(terms).filter(Boolean)
  return results.slice(0, 10)
}

function splitTokens(text: string): string[] {
  return text
    .split(/[\s,.;:!?()[\]{}'"<>/\\|`~@#$%^&*+=]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
}

function extractTextFromA11y(snapshot: string): string[] {
  const results: string[] = []
  const regex = /"text"\s*:\s*"([^"]+)"/g
  let match
  while ((match = regex.exec(snapshot)) !== null) {
    results.push(match[1]!)
  }
  return results
}

export function extractVisibleText(ctx: BrowserContext): string[] {
  const texts: string[] = []

  if (ctx.elementUnderCursor?.textContent) {
    texts.push(ctx.elementUnderCursor.textContent.trim())
  }
  if (ctx.elementUnderCursor?.ariaLabel) {
    texts.push(ctx.elementUnderCursor.ariaLabel.trim())
  }
  if (ctx.title) {
    texts.push(ctx.title.trim())
  }
  if (ctx.accessibilitySnapshot) {
    const textNodes = extractTextFromA11y(ctx.accessibilitySnapshot)
    for (const node of textNodes) texts.push(node.trim())
  }

  return [...new Set(texts.filter(Boolean))]
}

export function guessRouteFile(route: string): string[] {
  const paths: string[] = []
  const normalized = route.replace(/^\/+|\/+$/g, "")

  if (!normalized || normalized === "/") {
    paths.push("app/page.tsx", "app/page.ts", "pages/index.tsx", "pages/index.ts")
    return paths
  }

  const segments = normalized.split("/")

  // Next.js App Router patterns
  const appRoute = `app/${segments.join("/")}/page.tsx`
  paths.push(appRoute)
  paths.push(appRoute.replace(/\.tsx$/, ".ts"))

  const appRouteJsx = `app/${segments.join("/")}/page.jsx`
  paths.push(appRouteJsx)

  // Next.js App Router with layout
  paths.push(`app/${segments.join("/")}/layout.tsx`)

  // Next.js Pages Router patterns
  paths.push(`pages/${normalized}.tsx`)
  paths.push(`pages/${normalized}.ts`)
  paths.push(`pages/${normalized}/index.tsx`)
  paths.push(`pages/${normalized}/index.ts`)

  // Dynamic segments (Next.js)
  const dynamicApp = segments
    .map((s) => (looksDynamic(s) ? `[${s}]` : s))
    .join("/")
  if (dynamicApp !== segments.join("/")) {
    paths.push(`app/${dynamicApp}/page.tsx`)
  }

  return paths
}

function looksDynamic(segment: string): boolean {
  return /^\d+$/.test(segment) || /^[{(<]/.test(segment)
}

export function guessComponentName(domClass: string): string {
  if (!domClass) return ""

  // Try to find PascalCase component names from CSS module patterns
  const parts = domClass.split(/\s+/)
  for (const part of parts) {
    // CSS Modules: ComponentName_modulename__hash
    const cssModuleMatch = part.match(/^([A-Z][a-zA-Z0-9]+)_/)
    if (cssModuleMatch && cssModuleMatch[1]!.length >= 3) return cssModuleMatch[1]!

    // BEM-style: Block__Element--Modifier
    const bemMatch = part.match(/^([a-z]+(?:-[a-z]+)*)(?:__|--)/)
    if (bemMatch) return kebabToPascal(bemMatch[1]!)

    // Direct PascalCase match
    const pascalMatch = part.match(/^([A-Z][a-z]+(?:[A-Z][a-z]+)*)/)
    if (pascalMatch && pascalMatch[1]!.length >= 3) return pascalMatch[1]!
  }

  // Fallback: convert kebab to PascalCase
  if (/^[a-z]+(?:-[a-z]+)+$/.test(domClass)) {
    return kebabToPascal(domClass)
  }

  return ""
}

function kebabToPascal(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")
}


