/**
 * Hosts the standalone Bulk workspace (/bulk/) inside the shared dashboard Layout so it gets the
 * same sidebar as every other page. The Bulk page itself is unchanged and runs on the same origin,
 * so it shares the dashboard's stored login.
 */
export function BulkCampaign() {
  return <iframe className="bulk-campaign-frame" src="/bulk/" title="Bulk Campaign" />;
}
