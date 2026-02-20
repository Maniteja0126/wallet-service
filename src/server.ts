import { buildApp } from "./app";

const app = buildApp();

app.listen({ port: 3000 , host : "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }

  console.log(`Server running at ${address}`);
});