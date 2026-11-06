import { FindOperator } from 'typeorm';

// Minimal in-memory stand-in for Repository<Product>.findAndCount that really evaluates
// `where` (array = OR, object = AND), `order`, `skip` and `take`.
// Unknown operators throw, so a test can never pass just because the filter was ignored.

export interface MemProduct {
  id: number;
  title: string;
  description: string;
  price: number;
  rating?: number;
  stock?: number;
}

function matchesOperator(op: FindOperator<any>, actual: any): boolean {
  const value = op.value;
  switch (op.type) {
    case 'ilike': {
      // '%text%' -> case-insensitive "contains" (no wildcard chars inside text in these tests)
      const needle = String(value).replace(/^%|%$/g, '').toLowerCase();
      return String(actual).toLowerCase().includes(needle);
    }
    case 'between':
      return actual >= value[0] && actual <= value[1];
    case 'moreThanOrEqual':
      return actual >= value;
    case 'lessThanOrEqual':
      return actual <= value;
    case 'and':
      return (value as FindOperator<any>[]).every((child) => matchesOperator(child, actual));
    default:
      throw new Error(`memrepo: unsupported FindOperator "${op.type}"`);
  }
}

function matchesClause(row: Record<string, any>, clause: Record<string, any>): boolean {
  return Object.entries(clause).every(([field, cond]) => {
    if (cond === undefined) return true; // TypeORM ignores undefined conditions
    if (cond instanceof FindOperator) return matchesOperator(cond, row[field]);
    return row[field] === cond;
  });
}

export function memRepo(rows: MemProduct[]) {
  return {
    async findAndCount(opts: {
      where?: Record<string, any> | Record<string, any>[];
      order?: Record<string, string>;
      skip?: number;
      take?: number;
    }): Promise<[MemProduct[], number]> {
      const clauses = opts.where === undefined ? [] : Array.isArray(opts.where) ? opts.where : [opts.where];
      let found = clauses.length === 0 ? [...rows] : rows.filter((r) => clauses.some((c) => matchesClause(r, c)));

      const order = Object.entries(opts.order ?? {});
      found.sort((a, b) => {
        for (const [field, dir] of order) {
          const x = (a as any)[field];
          const y = (b as any)[field];
          if (x === y) continue;
          const cmp = x < y ? -1 : 1;
          return String(dir).toLowerCase() === 'desc' ? -cmp : cmp;
        }
        return 0;
      });

      const total = found.length;
      const skip = opts.skip ?? 0;
      found = found.slice(skip, opts.take === undefined ? undefined : skip + opts.take);
      return [found, total];
    },
  };
}
