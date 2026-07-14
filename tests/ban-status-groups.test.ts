import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBanStatus } from '../src/banStatusGroups.ts';

test('groups banned characters by bond and repeats multi-bond characters', () => {
  const groups = groupBanStatus({
    bannedBondIds: ['arcaneShip', 'steadShip', 'arcaneShip'],
    bannedCharacters: [
      {
        chessId: 'chess_dual',
        reasonBondIds: ['arcaneShip', 'steadShip'],
      },
      {
        chessId: 'chess_stead',
        reasonBondIds: ['steadShip'],
      },
      {
        chessId: 'chess_extra',
        reasonBondIds: ['extraShip'],
      },
    ],
  });

  assert.deepEqual(groups.map((group) => group.bondId), [
    'arcaneShip',
    'steadShip',
    'extraShip',
  ]);
  assert.deepEqual(groups.map((group) => group.characters.map((entry) => entry.chessId)), [
    ['chess_dual'],
    ['chess_dual', 'chess_stead'],
    ['chess_extra'],
  ]);
  assert.equal(
    groups.flatMap((group) => group.characters).filter((entry) => entry.chessId === 'chess_dual').length,
    2,
  );
});
