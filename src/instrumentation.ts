export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startSyncLoop, stopSyncLoop } = await import('@/lib/sync/engine');
    const { closeDb } = await import('@/lib/db/index');
    startSyncLoop(15_000);

    const shutdown = () => {
      console.log('[shutdown] SIGTERM received — stopping sync loop and closing DB');
      stopSyncLoop();
      closeDb();
      process.exit(0);
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT',  shutdown);
  }
}
