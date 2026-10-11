// Appearance/body catalogue only. Human and named animal role mechanics remain unchanged.
export const ANIMAL_CYCLES=Object.freeze({"A":{"westminster-roamer-2":"roach-sewer","westminster-roamer-4":"rat-ash","westminster-roamer-6":"dog-ash-coated","east-roamer-4":"dog-pack-chaser","east-roamer-5":"roach-rust-shell","east-roamer-7":"rat-sewer","east-roamer-9":"dog-street-mongrel","south-roamer-2":"roach-heavy-shell","south-roamer-3":"rat-mangy","south-roamer-8":"dog-street-mongrel"},"B":{"westminster-roamer-2":"roach-ash","westminster-roamer-4":"rat-soot","westminster-roamer-6":"dog-mangy-stray","east-roamer-2":"roach-nest-guard","east-roamer-4":"dog-gaunt-hound","east-roamer-5":"rat-heavy","east-roamer-7":"rat-sewer","east-roamer-9":"dog-stocky-yard","south-roamer-2":"roach-skitter","south-roamer-3":"rat-nest-defender","south-roamer-8":"dog-street-mongrel"}});
export const nextAnimalCycle=cycle=>cycle==='B'?'A':'B';
export function animalPlacement(cycle,key){
 const recipe=ANIMAL_CYCLES[cycle]?.[key];if(!recipe)return null;
 const offset=key==='east-roamer-9'?{x:-.014,z:-.278}:cycle==='A'&&key==='east-roamer-5'?{x:0,z:-.046}:{x:0,z:0};
 return {recipe,rig:recipe.startsWith('rat-')?'original-rat':recipe.startsWith('dog-')?'original-dog':'original-roach',offset};
}
