// Curated sRGB swatches become linear glTF-style factors ONCE at import.
// Apply only to private garment material clones; keep vertex grime/maps intact.
export const CLOTHING_PALETTE_VERSION='armagedom-clothing-033-v1';
const linear=hex=>Object.freeze([16,8,0].map(shift=>{const c=((parseInt(hex,16)>>shift)&255)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}));
const entries=(prefix,rows)=>Object.freeze(rows.flatMap(([family,...hexes])=>hexes.map((hex,i)=>Object.freeze({id:`${prefix}-${family}-${String(i+1).padStart(2,'0')}`,family,linear:linear(hex)}))));
export const TOP_COLOURS=entries('top',[
 ['charcoal','24272a','353a3b','4b4d49','62655f'],
 ['ash','70746e','878c84','a0a198','b4b8ac'],
 ['earth','514637','685341','806751','977e66'],
 ['tobacco','57422f','72583c','8e714a','a68b61'],
 ['rust','633e32','7c4e3e','976348','ad7b5c'],
 ['oxblood','4d3036','633a43','7d4e54','94666a'],
 ['olive','394332','536044','6b7857','86916c'],
 ['khaki','626049','7e7959','99916e','afa985'],
 ['dirty-ochre','736037','8d7947','a5905c','bda976'],
 ['sand','918271','a89881','bfaf98','d0c0a7'],
 ['faded-navy','273644','3a4b5a','536577','72808e'],
 ['blue-grey','4a5860','63737b','839198','a2adb0'],
 ['muted-plum','5b4655','886875'],
]);
export const TROUSER_COLOURS=entries('trousers',[
 ['charcoal','202326','303333','41453f','55584e'],
 ['ash','62665e','74796d','858b7b','989d8d'],
 ['earth','423a30','554735','6a5842','82715b'],
 ['tobacco','493728','624c33','7a6140','947b53'],
 ['rust','54392e','6a4736','82583f','9a7154'],
 ['oxblood','402b31','56353e','6b434b','82575e'],
 ['olive','303929','455039','5b6848','73805d'],
 ['khaki','55533f','6c684d','85805f','9d9675'],
 ['dirty-ochre','625231','79663c','907c4b','a69360'],
 ['sand','80715e','95836a','aa977a','bdae91'],
 ['faded-navy','22303d','33424e','495968','64727f'],
 ['blue-grey','3b4a51','516168','6a797f','89969a'],
 ['muted-plum','4a3947','705663'],
]);
// Family direction is curated; tonal separation keeps both garments readable.
const partners={charcoal:['ash','khaki','sand','tobacco','earth'],ash:['charcoal','earth','tobacco','faded-navy','oxblood'],earth:['charcoal','ash','khaki','olive','faded-navy'],tobacco:['charcoal','ash','olive','faded-navy','blue-grey'],rust:['charcoal','ash','olive','faded-navy','blue-grey'],oxblood:['charcoal','ash','earth','khaki','blue-grey'],olive:['charcoal','ash','tobacco','sand','earth','rust'],khaki:['charcoal','earth','oxblood','faded-navy','blue-grey'],'dirty-ochre':['charcoal','earth','faded-navy','blue-grey','olive'],sand:['charcoal','earth','tobacco','faded-navy','muted-plum'],'faded-navy':['ash','khaki','sand','tobacco','earth','dirty-ochre'],'blue-grey':['charcoal','earth','tobacco','khaki','oxblood'],'muted-plum':['charcoal','ash','earth','khaki','faded-navy']};
const luminance=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
export const PAIRINGS=Object.freeze(Object.fromEntries(TOP_COLOURS.map(top=>[top.id,Object.freeze(TROUSER_COLOURS.filter(trousers=>partners[top.family].includes(trousers.family)&&Math.abs(luminance(top.linear)-luminance(trousers.linear))>=.035).map(trousers=>trousers.id))])));
const trousersById=new Map(TROUSER_COLOURS.map(row=>[row.id,row]));
const outfits=new Map(TOP_COLOURS.map(top=>[top.id,new Map(PAIRINGS[top.id].map(trouserId=>[trouserId,Object.freeze({id:`${top.id}/${trouserId}`,topId:top.id,trouserId,jacket:top.linear,trousers:trousersById.get(trouserId).linear})]))]));
// Cached immutable objects/colour arrays, including when called repeatedly.
export function outfitFor(topId,trouserId){const outfit=outfits.get(topId)?.get(trouserId);if(!outfit)throw Error('Unknown or unapproved clothing pairing');return outfit;}
