import{closedData}from'./progression-state.js';
export const storyState=g=>g.openingStory??{commsRead:false,bountyStage:0};
export const validStory=s=>closedData(s,['commsRead','bountyStage'])&&typeof s.commsRead==='boolean'&&Number.isInteger(s.bountyStage)&&s.bountyStage>=0&&s.bountyStage<=2&&(s.bountyStage<2||s.commsRead);
// Historical save validation and local equipment-ledger compatibility only.
export const matronDefeated=g=>['pending','owned','legacy-dead'].includes(g.bossEquipment?.emberProjector?.status);
