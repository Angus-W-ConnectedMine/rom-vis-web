import { serve } from "bun";
import index from "./index.html";
import { getPoints } from "./points";

const workerTranspiler = new Bun.Transpiler({
  loader: "ts",
});

const server = serve({
  port: 8080,

  routes: {
    "/": index,

    "/generatePlan.worker.js": {
      async GET() {
        const source = await Bun.file("./src/generatePlan.worker.ts").text();
        const transpiled = workerTranspiler.transformSync(source);
        return new Response(transpiled, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },

    "/generatePlan.js": {
      async GET() {
        const source = await Bun.file("./src/generatePlan.ts").text();
        const transpiled = workerTranspiler.transformSync(source);
        return new Response(transpiled, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },

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
