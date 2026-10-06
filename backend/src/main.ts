import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core'; // default
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module'; // default

// run server
async function bootstrap() { // default
  const app = await NestFactory.create(AppModule); // default

  app.enableCors({ origin: process.env.FRONTEND_URL });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder() // NONDEFAULT: Swagger settings
    .setTitle('Products API')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = process.env.PORT ?? 3000; // default
  await app.listen(port); // default
  console.log(`Backend listening on http://localhost:${port}`); // Print out when backend runs
  console.log(`Swagger docs at http://localhost:${port}/docs`); // Print out where to acces Swagger docs
}
bootstrap(); // default
