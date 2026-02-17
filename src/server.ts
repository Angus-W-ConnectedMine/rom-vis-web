import { serve } from "bun";
import index from "./index.html";
import { getPoints } from "./points";

const server = serve({
  port: 8080,

  routes: {
    "/": index,

    "/points": {
      async GET(req) {
        const points = await getPoints();
        return Response.json(points);
      }
    }
  }
});

console.log(`Running at http://localhost:${server.port}`);
