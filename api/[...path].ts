import { createApp } from "../server/app.js";

let appPromise: ReturnType<typeof createApp> | undefined;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }

  return (await appPromise).app;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error("Vercel function bootstrap failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Internal Server Error",
      });
    }
  }
}
