interface Env {
  AGENT_API_SECRET: string;
}

const CLEANUP_URL = "https://goodsoilharvest.com/api/maintenance/cleanup";

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetch(CLEANUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.AGENT_API_SECRET}`,
        },
        body: "{}",
      }).then(async (res) => {
        const body = await res.text();
        console.log(`[cleanup-cron] ${res.status}: ${body}`);
      }).catch((err) => {
        console.error("[cleanup-cron] failed:", err);
      }),
    );
  },
};
