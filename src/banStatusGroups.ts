import type { BanStatus } from './api';

export type BannedCharacter = BanStatus['bannedCharacters'][number];

export interface BanBondGroup {
  bondId: string;
  characters: BannedCharacter[];
}

export function groupBanStatus(banStatus: BanStatus): BanBondGroup[] {
  const bondIds: string[] = [];
  const seenBondIds = new Set<string>();
  const appendBondId = (bondId: string) => {
    if (!bondId || seenBondIds.has(bondId)) return;
    seenBondIds.add(bondId);
    bondIds.push(bondId);
  };

  banStatus.bannedBondIds.forEach(appendBondId);
  banStatus.bannedCharacters.forEach((character) => {
    character.reasonBondIds.forEach(appendBondId);
  });

  return bondIds.map((bondId) => ({
    bondId,
    // A multi-bond character intentionally belongs to every matching group.
    characters: banStatus.bannedCharacters.filter((character) =>
      character.reasonBondIds.includes(bondId),
    ),
  }));
}
