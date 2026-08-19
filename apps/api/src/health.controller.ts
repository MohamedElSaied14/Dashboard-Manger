import { Controller, Get } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";

@Controller("health")
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  status() {
    const databaseConnected = this.connection.readyState === 1;
    return {
      status: databaseConnected ? "ok" : "degraded",
      api: "ok",
      database: {
        connected: databaseConnected,
        name: databaseConnected ? this.connection.name : null,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
