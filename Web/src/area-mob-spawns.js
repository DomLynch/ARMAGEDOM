// Registered world metres (x right, z forward), accepted Three020 layouts.
// Westminster: six scattered residents; production disables the optional opening trio.
// East/South: nine residents each. Only current-area actors update/render.
// Starts and full short patrol legs are clear at .55 (Hollow radius .4 + margin).
// Presentation selection uses placement keys, independent of fresh-run actor IDs.
const crookedResidents = new Set([
  'westminster-roamer-3', 'westminster-roamer-5',
  'east-roamer-3', 'east-roamer-6',
  'south-roamer-4', 'south-roamer-7',
]);
export function hollowLocomotionFor(entity) {
  return entity.kind >= 0 && entity.rig === 'hollow-scavenger' && crookedResidents.has(entity.placementKey)
    ? 'crooked-hollow' : null;
}
export const AREA_MOB_SPAWNS = Object.freeze({
  westminster: Object.freeze([
    Object.freeze({key:'westminster-roamer-1',pos:Object.freeze({x:-12.63653,z:9.32328}),patrol:Object.freeze([Object.freeze({x:-12.63653,z:9.32328}),Object.freeze({x:-10.63653,z:9.32328})])}),
    Object.freeze({key:'westminster-roamer-2',pos:Object.freeze({x:19.09336,z:8.16608}),patrol:Object.freeze([Object.freeze({x:19.09336,z:8.16608}),Object.freeze({x:17.09336,z:8.16608})])}),
    Object.freeze({key:'westminster-roamer-3',pos:Object.freeze({x:1.07515,z:6.00000}),patrol:Object.freeze([Object.freeze({x:1.07515,z:6.00000}),Object.freeze({x:-0.92485,z:6.00000})])}),
    Object.freeze({key:'westminster-roamer-4',pos:Object.freeze({x:10.31097,z:4.01143}),patrol:Object.freeze([Object.freeze({x:10.31097,z:4.01143}),Object.freeze({x:12.31097,z:4.01143})])}),
    Object.freeze({key:'westminster-roamer-5',pos:Object.freeze({x:-9.27988,z:4.01143}),patrol:Object.freeze([Object.freeze({x:-9.27988,z:4.01143}),Object.freeze({x:-7.27988,z:4.01143})])}),
    Object.freeze({key:'westminster-roamer-6',pos:Object.freeze({x:-6.73883,z:8.16608}),patrol:Object.freeze([Object.freeze({x:-6.73883,z:8.16608}),Object.freeze({x:-4.73883,z:8.16608})])}),
  ]),
  east: Object.freeze([
    Object.freeze({key:'east-roamer-1',pos:Object.freeze({x:15.03955,z:19.18419}),patrol:Object.freeze([Object.freeze({x:15.03955,z:19.18419}),Object.freeze({x:13.03955,z:19.18419})])}),
    Object.freeze({key:'east-roamer-2',pos:Object.freeze({x:-17.82920,z:2.17941}),patrol:Object.freeze([Object.freeze({x:-17.82920,z:2.17941}),Object.freeze({x:-15.82920,z:2.17941})])}),
    Object.freeze({key:'east-roamer-3',pos:Object.freeze({x:0.00000,z:7.05940}),patrol:Object.freeze([Object.freeze({x:0.00000,z:7.05940}),Object.freeze({x:2.00000,z:7.05940})])}),
    Object.freeze({key:'east-roamer-4',pos:Object.freeze({x:-3.79260,z:14.53346}),patrol:Object.freeze([Object.freeze({x:-3.79260,z:14.53346}),Object.freeze({x:-1.79260,z:14.53346})])}),
    Object.freeze({key:'east-roamer-5',pos:Object.freeze({x:-9.67637,z:6.00000}),patrol:Object.freeze([Object.freeze({x:-9.67637,z:6.00000}),Object.freeze({x:-7.67637,z:6.00000})])}),
    Object.freeze({key:'east-roamer-6',pos:Object.freeze({x:8.42609,z:11.80376}),patrol:Object.freeze([Object.freeze({x:8.42609,z:11.80376}),Object.freeze({x:8.42609,z:13.80376})])}),
    Object.freeze({key:'east-roamer-7',pos:Object.freeze({x:-8.22927,z:10.53455}),patrol:Object.freeze([Object.freeze({x:-8.22927,z:10.53455}),Object.freeze({x:-6.22927,z:10.53455})])}),
    Object.freeze({key:'east-roamer-8',pos:Object.freeze({x:-9.35289,z:-0.31328}),patrol:Object.freeze([Object.freeze({x:-9.35289,z:-0.31328}),Object.freeze({x:-9.35289,z:1.68672})])}),
    Object.freeze({key:'east-roamer-9',pos:Object.freeze({x:1.20373,z:11.80376}),patrol:Object.freeze([Object.freeze({x:1.20373,z:11.80376}),Object.freeze({x:3.20373,z:11.80376})])}),
  ]),
  south: Object.freeze([
    Object.freeze({key:'south-roamer-1',pos:Object.freeze({x:-10.41654,z:-6.36264}),patrol:Object.freeze([Object.freeze({x:-10.41654,z:-6.36264}),Object.freeze({x:-8.41654,z:-6.36264})])}),
    Object.freeze({key:'south-roamer-2',pos:Object.freeze({x:10.93785,z:19.18419}),patrol:Object.freeze([Object.freeze({x:10.93785,z:19.18419}),Object.freeze({x:8.93785,z:19.18419})])}),
    Object.freeze({key:'south-roamer-3',pos:Object.freeze({x:-15.03955,z:19.18419}),patrol:Object.freeze([Object.freeze({x:-15.03955,z:19.18419}),Object.freeze({x:-17.03955,z:19.18419})])}),
    Object.freeze({key:'south-roamer-4',pos:Object.freeze({x:5.05198,z:3.07703}),patrol:Object.freeze([Object.freeze({x:5.05198,z:3.07703}),Object.freeze({x:7.05198,z:3.07703})])}),
    Object.freeze({key:'south-roamer-5',pos:Object.freeze({x:-8.78897,z:7.05940}),patrol:Object.freeze([Object.freeze({x:-8.78897,z:7.05940}),Object.freeze({x:-10.78897,z:7.05940})])}),
    Object.freeze({key:'south-roamer-6',pos:Object.freeze({x:-4.10170,z:19.18419}),patrol:Object.freeze([Object.freeze({x:-4.10170,z:19.18419}),Object.freeze({x:-2.10170,z:19.18419})])}),
    Object.freeze({key:'south-roamer-7',pos:Object.freeze({x:1.60254,z:-6.36264}),patrol:Object.freeze([Object.freeze({x:1.60254,z:-6.36264}),Object.freeze({x:3.60254,z:-6.36264})])}),
    Object.freeze({key:'south-roamer-8',pos:Object.freeze({x:2.40745,z:11.80376}),patrol:Object.freeze([Object.freeze({x:2.40745,z:11.80376}),Object.freeze({x:4.40745,z:11.80376})])}),
    Object.freeze({key:'south-roamer-9',pos:Object.freeze({x:-4.76500,z:0.48615}),patrol:Object.freeze([Object.freeze({x:-4.76500,z:0.48615}),Object.freeze({x:-2.76500,z:0.48615})])}),
  ]),
});
