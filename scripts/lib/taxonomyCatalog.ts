import fs from 'node:fs';
import path from 'node:path';

interface TaxonomyNode {
  code: string;
  name: string;
  category: string;
  children?: TaxonomyNode[];
}

export interface KnowledgePointCatalogEntry {
  code: string;
  name: string;
  category: string;
  isLeaf: boolean;
}

export function loadKnowledgePointCatalog(): KnowledgePointCatalogEntry[] {
  const taxonomyPath = path.resolve(import.meta.dirname, '..', '..', 'prompts', 'taxonomy.json');
  const raw = fs.readFileSync(taxonomyPath, 'utf-8');
  const nodes = JSON.parse(raw) as TaxonomyNode[];
  const entries: KnowledgePointCatalogEntry[] = [];
  const stack = [...nodes];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const isLeaf = !Array.isArray(current.children) || current.children.length === 0;
    entries.push({
      code: current.code,
      name: current.name,
      category: current.category,
      isLeaf,
    });

    if (Array.isArray(current.children)) {
      stack.push(...current.children);
    }
  }

  return entries.sort((left, right) => left.code.localeCompare(right.code));
}

export function loadLeafKnowledgePointCodes(): Set<string> {
  return new Set(loadKnowledgePointCatalog().filter((entry) => entry.isLeaf).map((entry) => entry.code));
}

export function formatLeafKnowledgePointCatalog(): string {
  return loadKnowledgePointCatalog()
    .filter((entry) => entry.isLeaf)
    .map((entry) => `${entry.code} ${entry.name}`)
    .join('\n');
}