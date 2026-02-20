import Fastify from "fastify";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

import transactionRoutes from "./modules/transaction/transaction.route";
import walletRoutes from "./modules/wallet/wallet.route";

export const buildApp = () => {
  const app = Fastify({ logger: true });

  app.register(sensible);

  app.register(swagger, {
    openapi: {
      info: {
        title: "Wallet Service",
        description: "Ledger-based internal wallet",
        version: "1.0.0",
      },
    },
  });

  app.register(swaggerUI, {
    routePrefix: "/docs",
  });

  app.register(transactionRoutes, { prefix: "/transactions" });
  app.register(walletRoutes, { prefix: "/wallet" });

  app.get("/health", async () => ({ status: "Ok" }));

  return app;
};