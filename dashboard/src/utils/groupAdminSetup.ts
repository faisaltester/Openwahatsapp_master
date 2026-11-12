export interface CreatedGroup { id: string; name: string }
export interface GroupMember { id: string; isAdmin: boolean; isSuperAdmin: boolean }
export interface GroupParticipantResult { id: string; success: boolean; status?: number; message?: string }

export interface GroupCreationApi {
  createGroup(sessionId: string, name: string, members: string[], signal?: AbortSignal): Promise<CreatedGroup>;
  getGroupInfo(sessionId: string, groupId: string, signal?: AbortSignal): Promise<{ participants: GroupMember[] }>;
  promoteGroupParticipants(sessionId: string, groupId: string, members: string[], signal?: AbortSignal): Promise<{
    success: boolean; results: GroupParticipantResult[];
  }>;
}

/** Creation succeeded: retrying the whole operation would create a duplicate group. */
export class GroupAdminSetupError extends Error {
  readonly group: CreatedGroup;
  constructor(group: CreatedGroup, error: unknown) {
    super(`Group created (${group.id}), but admin setup was not completed: ${error instanceof Error ? error.message : 'No confirmation'}. Do not recreate this group; check its admins in WhatsApp.`);
    this.name = 'GroupAdminSetupError';
    this.group = group;
  }
}

const normalizeId = (id: string) => id.replace(/@s\.whatsapp\.net$/, '@c.us');

export async function createGroupWithAdmins(
  api: GroupCreationApi,
  options: { sessionId: string; name: string; members: string[]; allMembersAdmin: boolean; signal?: AbortSignal },
  onCreated?: (group: CreatedGroup) => void,
): Promise<{ group: CreatedGroup; adminCount?: number }> {
  const { sessionId, name, members, allMembersAdmin, signal } = options;
  signal?.throwIfAborted();
  const group = await api.createGroup(sessionId, name, members, signal);
  if (!allMembersAdmin) return { group };
  onCreated?.(group);
  try {
    signal?.throwIfAborted();
    // Use the actual roster, including privacy/LID identifiers. The creator is already an
    // admin, and WhatsApp can exclude some invited numbers under their privacy settings.
    const info = await api.getGroupInfo(sessionId, group.id, signal);
    if (!Array.isArray(info.participants) || !info.participants.length || info.participants.some(p => !p.id)) {
      throw new Error('WhatsApp did not return a confirmed member list');
    }
    const targets = [...new Set(info.participants.filter(p => !p.isAdmin && !p.isSuperAdmin).map(p => p.id))];
    if (targets.length) {
      signal?.throwIfAborted();
      const response = await api.promoteGroupParticipants(sessionId, group.id, targets, signal);
      const results = Array.isArray(response.results) ? response.results : [];
      const confirmed = targets.filter(id => {
        const entries = results.filter(r => normalizeId(r.id) === normalizeId(id));
        return entries.length > 0 && entries.every(r => r.success === true);
      }).length;
      // A 200 HTTP response can still contain individual refusals or missing confirmations.
      if (!response.success || confirmed !== targets.length) {
        throw new Error(`Admin promotion confirmed for ${confirmed} of ${targets.length} members`);
      }
    }
    return { group, adminCount: info.participants.length };
  } catch (error) {
    throw new GroupAdminSetupError(group, error);
  }
}
