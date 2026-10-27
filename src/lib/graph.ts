/**
 * Supply Chain Sentinel 2.0 - Dependency Attack Graph Engine
 * Constructs verified dependency trees, maps direct vs transitive lineage,
 * computes blast radius, and traces plausible attack paths with supporting evidence.
 */

import {
  DependencyPackage,
  Finding,
  DependencyGraphData,
  DependencyGraphNode,
  DependencyGraphEdge,
  PlausibleAttackPath,
  Severity,
} from './types';

export interface BuildGraphOptions {
  rootName: string;
  rootVersion?: string;
  packages: DependencyPackage[];
  findings?: Finding[];
  manifestPath?: string;
}

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export function buildDependencyGraph(options: BuildGraphOptions): DependencyGraphData {
  const {
    rootName,
    rootVersion = 'main',
    packages,
    findings = [],
    manifestPath = 'package.json',
  } = options;

  // Map findings to package names
  const findingsByPackage = new Map<string, Finding[]>();
  for (const f of findings) {
    let pkgKey = '';
    if (f.observedValue && f.observedValue.includes('@')) {
      pkgKey = f.observedValue.split('@')[0].trim();
    } else if (f.observedValue) {
      pkgKey = f.observedValue.trim();
    } else if (f.filePath && !f.filePath.includes('.github/workflows')) {
      const match = f.filePath.match(/node_modules\/([^/]+)/);
      if (match) pkgKey = match[1];
    }

    if (pkgKey) {
      const list = findingsByPackage.get(pkgKey) || [];
      list.push(f);
      findingsByPackage.set(pkgKey, list);
    }
  }

  // Create unique package map (key: package name)
  const packageMap = new Map<string, DependencyPackage>();
  for (const pkg of packages) {
    if (!packageMap.has(pkg.name)) {
      packageMap.set(pkg.name, pkg);
    }
  }

  // Identify root direct dependencies
  const directDepNames = new Set<string>();
  for (const pkg of packages) {
    if (pkg.isDirect) {
      directDepNames.add(pkg.name);
    }
  }

  // If no package has isDirect=true, treat top-level packages as direct
  if (directDepNames.size === 0 && packages.length > 0) {
    for (const pkg of packages) {
      if (!pkg.parentPackage) {
        directDepNames.add(pkg.name);
        pkg.isDirect = true;
      }
    }
  }

  // 1. Build Nodes
  const nodesMap = new Map<string, DependencyGraphNode>();

  // Root application node
  const rootId = 'root-app';
  nodesMap.set(rootId, {
    id: rootId,
    name: rootName,
    version: rootVersion,
    ecosystem: 'npm',
    isDirect: true,
    isRoot: true,
    manifestPath,
    scope: 'production',
    hasVulnerability: false,
    advisoryCount: 0,
    findings: [],
    blastRadius: packages.length,
    parents: [],
    children: Array.from(directDepNames),
    inAttackPath: false,
    depth: 0,
  });

  // Package nodes
  for (const [name, pkg] of packageMap.entries()) {
    const pkgFindings = findingsByPackage.get(name) || [];
    let highestSeverity: Severity | undefined;
    if (pkgFindings.length > 0) {
      highestSeverity = pkgFindings.reduce((prev, curr) => {
        return SEVERITY_WEIGHTS[curr.severity] > SEVERITY_WEIGHTS[prev] ? curr.severity : prev;
      }, 'info' as Severity);
    }

    const isDirect = directDepNames.has(name) || Boolean(pkg.isDirect);
    const scope = pkg.dev ? 'development' : (pkg.dependencyScope || 'production');

    nodesMap.set(name, {
      id: name,
      name,
      version: pkg.version,
      ecosystem: pkg.ecosystem || 'npm',
      isDirect,
      isRoot: false,
      manifestPath: pkg.manifestPath || manifestPath,
      scope,
      hasVulnerability: pkgFindings.length > 0,
      highestSeverity,
      advisoryCount: pkgFindings.length,
      findings: pkgFindings,
      blastRadius: 0, // calculated below
      parents: [],
      children: [],
      inAttackPath: false,
      depth: isDirect ? 1 : 2,
    });
  }

  // 2. Build Edges & Adjacency Lists
  const edges: DependencyGraphEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (source: string, target: string, specifier?: string, isTransitive: boolean = false) => {
    const key = `${source}->${target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);

    edges.push({
      id: `edge-${key}`,
      source,
      target,
      specifier,
      isTransitive,
      isInAttackPath: false,
    });

    const srcNode = nodesMap.get(source);
    const tgtNode = nodesMap.get(target);
    if (srcNode && !srcNode.children.includes(target)) {
      srcNode.children.push(target);
    }
    if (tgtNode && !tgtNode.parents.includes(source)) {
      tgtNode.parents.push(source);
    }
  };

  // Connect root to direct dependencies
  for (const directName of directDepNames) {
    if (nodesMap.has(directName)) {
      const pkg = packageMap.get(directName);
      addEdge(rootId, directName, pkg?.rawSpecifier || pkg?.version, false);
    }
  }

  // Connect package dependencies
  for (const [name, pkg] of packageMap.entries()) {
    if (pkg.dependencies && typeof pkg.dependencies === 'object') {
      for (const [childName, specifier] of Object.entries(pkg.dependencies)) {
        if (nodesMap.has(childName)) {
          addEdge(name, childName, specifier, true);
        }
      }
    } else if (pkg.parentPackage && nodesMap.has(pkg.parentPackage)) {
      addEdge(pkg.parentPackage, name, pkg.rawSpecifier || pkg.version, true);
    }
  }

  // 3. Compute Depths with BFS from root
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  const visited = new Set<string>([rootId]);
  let maxDepth = 0;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const node = nodesMap.get(id);
    if (node) {
      node.depth = depth;
      if (depth > maxDepth) maxDepth = depth;

      for (const childId of node.children) {
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push({ id: childId, depth: depth + 1 });
        }
      }
    }
  }

  // 4. Compute Blast Radius (Count of all transitive dependents + children)
  for (const [id, node] of nodesMap.entries()) {
    if (node.isRoot) continue;

    // Reachable ancestors (who depends on this node)
    const ancestorVisited = new Set<string>();
    const ancestorQueue = [...node.parents];
    while (ancestorQueue.length > 0) {
      const p = ancestorQueue.shift()!;
      if (!ancestorVisited.has(p)) {
        ancestorVisited.add(p);
        const pNode = nodesMap.get(p);
        if (pNode) {
          for (const gp of pNode.parents) {
            ancestorQueue.push(gp);
          }
        }
      }
    }

    // Reachable children
    const childVisited = new Set<string>();
    const childQueue = [...node.children];
    while (childQueue.length > 0) {
      const c = childQueue.shift()!;
      if (!childVisited.has(c)) {
        childVisited.add(c);
        const cNode = nodesMap.get(c);
        if (cNode) {
          for (const gc of cNode.children) {
            childQueue.push(gc);
          }
        }
      }
    }

    node.blastRadius = ancestorVisited.size + childVisited.size;
  }

  // 5. Trace Plausible Attack Paths from root to vulnerable packages
  const attackPaths: PlausibleAttackPath[] = [];

  // Function to find shortest path from root to target node
  const findPathFromRoot = (targetId: string): string[] | null => {
    const pathQueue: Array<{ current: string; path: string[] }> = [
      { current: rootId, path: [rootId] },
    ];
    const pathVisited = new Set<string>([rootId]);

    while (pathQueue.length > 0) {
      const { current, path } = pathQueue.shift()!;
      if (current === targetId) return path;

      const node = nodesMap.get(current);
      if (node) {
        for (const childId of node.children) {
          if (!pathVisited.has(childId)) {
            pathVisited.add(childId);
            pathQueue.push({ current: childId, path: [...path, childId] });
          }
        }
      }
    }
    return null;
  };

  let pathCounter = 1;
  for (const [id, node] of nodesMap.entries()) {
    if (!node.hasVulnerability || node.isRoot) continue;

    const path = findPathFromRoot(id);
    if (!path) continue;

    // Mark nodes and edges in attack path
    for (const pathNodeId of path) {
      const pn = nodesMap.get(pathNodeId);
      if (pn) pn.inAttackPath = true;
    }

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const edge = edges.find((e) => e.source === from && e.target === to);
      if (edge) edge.isInAttackPath = true;
    }

    const finding = node.findings[0];
    const advisoryId = finding?.id || 'KNOWN-VULN';
    const cve = finding?.aliases?.[0] || finding?.id;

    // Construct evidence-based plausibility rationale
    let rationale = '';
    if (node.isDirect) {
      rationale = `Direct ${node.scope} dependency explicitly required by the root project. Advisory ${advisoryId} (${cve || 'Advisory'}) creates an active attack surface directly reachable through application code invocation.`;
    } else {
      const immediateParent = path[path.length - 2];
      rationale = `Transitive ${node.scope} dependency introduced by direct parent [${immediateParent}] along lineage [${path.join(' -> ')}]. Vulnerability ${advisoryId} is reachable whenever ${immediateParent} utilizes ${node.name}@${node.version}.`;
    }

    attackPaths.push({
      id: `attack-path-${pathCounter++}`,
      targetPackage: node.name,
      targetVersion: node.version,
      severity: node.highestSeverity || 'high',
      path,
      advisoryId,
      cve,
      scope: node.scope === 'development' ? 'development' : 'production',
      blastRadius: node.blastRadius,
      plausibilityRationale: rationale,
    });
  }

  // Sort attack paths by severity then blast radius
  attackPaths.sort((a, b) => {
    const diff = SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity];
    if (diff !== 0) return diff;
    return b.blastRadius - a.blastRadius;
  });

  const nodes = Array.from(nodesMap.values());
  const directCount = nodes.filter((n) => !n.isRoot && n.isDirect).length;
  const transitiveCount = nodes.filter((n) => !n.isRoot && !n.isDirect).length;
  const vulnerableCount = nodes.filter((n) => !n.isRoot && n.hasVulnerability).length;

  return {
    nodes,
    edges,
    attackPaths,
    totalPackages: nodes.length - 1, // exclude root
    directCount,
    transitiveCount,
    vulnerableCount,
    maxDepth,
  };
}
