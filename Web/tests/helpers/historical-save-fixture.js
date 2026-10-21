// Test-only projection for deliberately constructed valid historical fixtures.
// Never use this to repair a corrupt input; mutate corruption after projection.
export function historicalSave(current,version){
 const saved=structuredClone(current);saved.version=version;
 delete saved.marked;
 if(version<16){const marshal=saved.bossEquipment?.commanderPistol;if(marshal){delete marshal.magazine;delete marshal.reserve;if(marshal.selected)saved.pistol.equipped=true;}if(saved.locker){delete saved.locker.ammo['railgun-reserve'];saved.locker.weapons=saved.locker.weapons.filter(id=>id!=='borough-marshals-pistol-v1');}}
 if(version<15&&saved.locker)saved.locker.weapons=saved.locker.weapons.filter(id=>id!=='watchmans-pistol-v1');
 if(version<14)delete saved.openingStory;
 if(version<12)delete saved.locker;
 if(version<10)delete saved.bossEquipment;
 return saved;
}
