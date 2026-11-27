import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core'; // default
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module'; // default

const pipeOptions = { whitelist: true, transform: true };
const defaultExceptionFactory = new ValidationPipe(pipeOptions).createExceptionFactory();

// 400 body keeps the default shape; adds `errors` per failed price bound only (001-ADR-1)
function exceptionFactory(validationErrors: ValidationError[] = []) {
  const base = defaultExceptionFactory(validationErrors);
  const priceErrors: Record<string, string> = {};
  for (const e of validationErrors) {
    if (e.property !== 'minPrice' && e.property !== 'maxPrice') continue;
    const first = Object.values(e.constraints ?? {})[0];
    if (first) priceErrors[e.property] = first;
  }
  if (Object.keys(priceErrors).length === 0 || !(base instanceof BadRequestException)) return base;
  return new BadRequestException({ ...(base.getResponse() as object), errors: priceErrors });
}

// run server
async function bootstrap() { // default
  const app = await NestFactory.create<NestExpressApplication>(AppModule); // Express app type -> useStaticAssets exists

  app.enableShutdownHooks(); // Ctrl+C / docker stop -> gọi onModuleDestroy (đóng kết nối Redis, DB)
  app.enableCors({ origin: process.env.FRONTEND_URL });
  app.useGlobalPipes(new ValidationPipe({ ...pipeOptions, exceptionFactory }));
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' }); // serve backend/uploads/* at /uploads/*

  const swaggerConfig = new DocumentBuilder() // NONDEFAULT: Swagger settings
    .setTitle('Products API')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = process.env.PORT ?? 3000; // default
  await app.listen(port); // default
  // Print out backend + Swagger links, highlighted so they stand out from Nest's logs
  const cyan = (s: string) => `\x1b[36m\x1b[1m${s}\x1b[0m`;
  console.log(`
  \x1b[32m➜\x1b[0m  Backend:  ${cyan(`http://localhost:${port}`)}
  \x1b[32m➜\x1b[0m  Swagger:  ${cyan(`http://localhost:${port}/docs`)}
`);
}
bootstrap(); // default
