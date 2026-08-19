import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { setServers } from "node:dns";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "./app.module";
import helmet from "helmet";

function configureDnsServers() {
  let configured = process.env.DNS_SERVERS;

  if (!configured) {
    for (const path of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
      if (!existsSync(path)) continue;
      const match = readFileSync(path, "utf8").match(/^DNS_SERVERS=(.+)$/m);
      if (match?.[1]) {
        configured = match[1].trim();
        break;
      }
    }
  }

  const servers = configured?.split(",").map((server) => server.trim()).filter(Boolean);
  if (servers?.length) setServers(servers);
}

async function bootstrap() {
  configureDnsServers();
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: config.get("WEB_URL", "http://localhost:3000"),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  await app.listen(config.get("PORT", 4000));
}

bootstrap();
