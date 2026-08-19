import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ClientsService } from "./clients.service";

@Injectable()
export class ClientAccessGuard implements CanActivate {
  constructor(private readonly clients: ClientsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const clientId = request.params.clientId ?? request.params.id;
    if (!clientId || !request.user) throw new ForbiddenException("Client access denied");
    if (!(await this.clients.canAccess(clientId, request.user))) {
      throw new ForbiddenException("You do not have access to this client");
    }
    return true;
  }
}
