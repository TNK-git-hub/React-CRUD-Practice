import 'reflect-metadata';
import { ParseIntPipe, RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProductsController } from '../../src/products/products.controller';

// The method name is not fixed by the task, so find the handler by its route
const handler = () => {
  const proto = ProductsController.prototype as any;
  const name = Object.getOwnPropertyNames(proto).find(
    (n) => n !== 'constructor' && Reflect.getMetadata('path', proto[n]) === ':id/reviews',
  );
  return { proto, name };
};

describe('ProductsController review route', () => {
  it('declares POST :id/reviews (bug: wrong path or HTTP method)', () => {
    const { proto, name } = handler();
    expect(name).toBeDefined();
    expect(Reflect.getMetadata('method', proto[name!])).toBe(RequestMethod.POST);
  });

  it('does not override the default 201 status of POST', () => {
    const { proto, name } = handler();
    expect(name).toBeDefined();
    const code = Reflect.getMetadata('__httpCode__', proto[name!]);
    expect(code === undefined || code === 201).toBe(true);
  });

  it('parses :id with ParseIntPipe (bug: NaN id reaches the db)', () => {
    const { proto, name } = handler();
    expect(name).toBeDefined();
    const args = Reflect.getMetadata('__routeArguments__', ProductsController, name!) ?? {};
    const pipes = Object.values<any>(args).flatMap((a) => a.pipes ?? []);
    const hasParseInt = pipes.some((p) => p === ParseIntPipe || p instanceof ParseIntPipe);
    expect(hasParseInt).toBe(true);
  });
});
