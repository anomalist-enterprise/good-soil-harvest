interface Env {
  AGENT_API_SECRET: string;
}

const DIGEST_URL = "https://goodsoilharvest.com/api/notifications/digest";

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetch(DIGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.AGENT_API_SECRET}`,
        },
        body: "{}",
      }).then(async (res) => {
        const body = await res.text();
        console.log(`[digest-cron] ${res.status}: ${body}`);
      }).catch((err) => {
        console.error("[digest-cron] failed:", err);
      }),
    );
  },
};
