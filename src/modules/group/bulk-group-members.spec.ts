import { ForbiddenException } from '@nestjs/common';
import { GroupService } from './group.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { SendPacingService } from '../message/send-pacing.service';

const member = (id: string, isAdmin = false) => ({ id, number: id.split('@')[0], isAdmin, isSuperAdmin: false });
function setup(admin = true) {
  const engine = {
    getPhoneNumber: jest.fn(() => '919111111111'),
    getGroups: jest.fn().mockResolvedValue([{ id: 'g@g.us', name: 'Team', isAdmin: admin, participantsCount: 2 }]),
    getGroupInfo: jest.fn().mockResolvedValue({ id: 'g@g.us', name: 'Team', participants: [member('919111111111@c.us', admin), member('919222222222@s.whatsapp.net')] }),
    resolveContactPhone: jest.fn().mockResolvedValue(null),
    addParticipants: jest.fn().mockResolvedValue([{ id: '919333333333@c.us', success: true }]),
  };
  const registry = new EngineRegistry(); registry.set('s1', engine as unknown as IWhatsAppEngine);
  const pacing = { assertReachoutAllowed: jest.fn().mockResolvedValue(0), chargeGroupReachouts: jest.fn() };
  return { engine, service: new GroupService(registry, pacing as unknown as SendPacingService) };
}
describe('Bulk group member management', () => {
  it('lists both admin and non-admin groups without dropping role fields', async () => {
    const { engine, service } = setup();
    engine.getGroups.mockResolvedValue([{ id: 'a@g.us', name: 'A', isAdmin: true, participantsCount: 2 }, { id: 'b@g.us', name: 'B', isAdmin: false, participantsCount: 4 }]);
    expect(await service.getMemberManagementGroups('s1')).toMatchObject({ total: 2, admin: 1, nonAdmin: 1, items: expect.arrayContaining([expect.objectContaining({ isAdmin: false })]) });
  });
  it('refuses a non-admin without attempting any addition', async () => {
    const { engine, service } = setup(false);
    await expect(service.bulkManageMembers('s1', 'g@g.us', ['919333333333'])).rejects.toBeInstanceOf(ForbiddenException);
    expect(engine.addParticipants).not.toHaveBeenCalled();
  });
  it('skips existing and input-duplicate numbers and reports partial failures', async () => {
    const { engine, service } = setup();
    engine.addParticipants.mockResolvedValue([{ id: '919333333333@s.whatsapp.net', success: true }, { id: '919444444444@c.us', success: false, status: 403 }]);
    const result = await service.bulkManageMembers('s1', 'g@g.us', ['919222222222', '+919333333333', '919333333333', '919444444444']);
    expect(engine.addParticipants).toHaveBeenCalledWith('g@g.us', ['919333333333@c.us', '919444444444@c.us']);
    expect(result).toMatchObject({ total: 3, skipped: 1, added: 1, failed: 1 });
  });
  it('preview only checks and never adds', async () => {
    const { engine, service } = setup();
    expect(await service.bulkManageMembers('s1', 'g@g.us', ['919222222222', '919333333333'], true)).toMatchObject({ skipped: 1, ready: 1, added: 0 });
    expect(engine.addParticipants).not.toHaveBeenCalled();
  });
  it('resolves a privacy LID before skipping the matching phone number', async () => {
    const { engine, service } = setup();
    engine.getGroupInfo.mockResolvedValue({ id: 'g@g.us', name: 'Team', participants: [member('919111111111@c.us', true), member('12345@lid')] });
    engine.resolveContactPhone.mockResolvedValue('919333333333');
    expect(await service.bulkManageMembers('s1', 'g@g.us', ['919333333333'])).toMatchObject({ skipped: 1, added: 0 });
    expect(engine.addParticipants).not.toHaveBeenCalled();
  });
  it('does not guess membership when privacy identities remain unknown', async () => {
    const { engine, service } = setup();
    engine.getGroupInfo.mockResolvedValue({ id: 'g@g.us', name: 'Team', participants: [member('919111111111@c.us', true), member('12345@lid')] });
    expect(await service.bulkManageMembers('s1', 'g@g.us', ['919333333333'])).toMatchObject({ failed: 1, added: 0 });
    expect(engine.addParticipants).not.toHaveBeenCalled();
  });
  it('turns unconfirmed additions into failures without retrying', async () => {
    const { engine, service } = setup(); engine.addParticipants.mockRejectedValue(new Error('Connection closed; check group before retrying'));
    expect(await service.bulkManageMembers('s1', 'g@g.us', ['919333333333'])).toMatchObject({ failed: 1, added: 0 });
    expect(engine.addParticipants).toHaveBeenCalledTimes(1);
  });
});
