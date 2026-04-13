import { createApp } from "../server/app";

let appPromise: ReturnType<typeof createApp> | undefined;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }

  return (await appPromise).app;
}

export default async function handler(req: any, res: any) {
  const app = await getApp();
  return app(req, res);
}
