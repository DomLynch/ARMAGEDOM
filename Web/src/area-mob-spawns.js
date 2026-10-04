// Registered world metres (x right, z forward), accepted Three020 layouts.
// Westminster contains only the two EXTRA roamers; keep the opening three.
// Short patrol legs are clear at radius .55 (Hollow radius .4 + margin).
export const AREA_MOB_SPAWNS = Object.freeze({
  westminster: Object.freeze([
    Object.freeze({key:'westminster-roamer-1',pos:Object.freeze({x:-14.83139,z:7.05940}),patrol:Object.freeze([Object.freeze({x:-14.83139,z:7.05940}),Object.freeze({x:-12.83139,z:7.05940})])}),
    Object.freeze({key:'westminster-roamer-2',pos:Object.freeze({x:18.17300,z:8.73815}),patrol:Object.freeze([Object.freeze({x:18.17300,z:8.73815}),Object.freeze({x:20.17300,z:8.73815})])}),
  ]),
  east: Object.freeze([
    Object.freeze({key:'east-roamer-1',pos:Object.freeze({x:-10.41769,z:4.49314}),patrol:Object.freeze([Object.freeze({x:-10.41769,z:4.49314}),Object.freeze({x:-8.41769,z:4.49314})])}),
    Object.freeze({key:'east-roamer-2',pos:Object.freeze({x:9.48150,z:14.53346}),patrol:Object.freeze([Object.freeze({x:9.48150,z:14.53346}),Object.freeze({x:11.48150,z:14.53346})])}),
  ]),
  south: Object.freeze([
    Object.freeze({key:'south-roamer-1',pos:Object.freeze({x:4.54325,z:8.73815}),patrol:Object.freeze([Object.freeze({x:4.54325,z:8.73815}),Object.freeze({x:2.54325,z:8.73815})])}),
    Object.freeze({key:'south-roamer-2',pos:Object.freeze({x:-1.71154,z:-3.90262}),patrol:Object.freeze([Object.freeze({x:-1.71154,z:-3.90262}),Object.freeze({x:0.28846,z:-3.90262})])}),
  ]),
});
