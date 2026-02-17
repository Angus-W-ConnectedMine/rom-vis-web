import { serve } from "bun";
import index from "./index.html";

const server = serve({
  port: 8080,

  routes: {
      "/": index
  }
});

console.log(`Running at http://localhost:${server.port}`);
