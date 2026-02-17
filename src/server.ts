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
    },

    "/test-data": {
      async GET(req) {
        const { generateTestData } = await import("./testData");
        await generateTestData();
        return new Response("Test data generated");
      }
    }
  }
});

console.log(`Running at http://localhost:${server.port}`);
