#!/bin/bash
# Release 336 gates (297 was never published): rollback-saves against frozen baselines, build, assets, packaging.
R=/mnt/HC_Volume_107195252
BASES="deploy226-b224 deploy226-b225 deploy227-b226 deploy228-b227 deploy229-b228 deploy230-b229 deploy231-b230 deploy232-b231 deploy233-b232 deploy234-b233 deploy235-b234 deploy236-b235 deploy237-b236 deploy238-b237 deploy239-b238 deploy240-b239 deploy241-b240 deploy242-b241 deploy243-b242 deploy244-b243 deploy245-b244 deploy246-b245 deploy247-b246 deploy248-b247 deploy249-b248 deploy250-b249 deploy251-b250 deploy252-b251 deploy253-b252 deploy254-b253 deploy255-b254 deploy256-b255 deploy257-b256 deploy258-b257 deploy259-b258 deploy260-b259 deploy261-b260 deploy262-b261 deploy263-b262 deploy264-b263 deploy265-b264 deploy266-b265 deploy267-b266 deploy268-b267 deploy269-b268 deploy270-b269 deploy271-b270 deploy272-b271 deploy273-b272 deploy274-b273 deploy275-b274 deploy276-b275 deploy277-b276 deploy278-b277 deploy279-b278 deploy280-b279 deploy281-b280 deploy282-b281 deploy283-b282 deploy284-b283 deploy285-b284 deploy286-b285 deploy287-b286 deploy288-b287 deploy289-b288 deploy290-b289 deploy291-b290 deploy292-b291 deploy293-b292 deploy294-b293 deploy295-b294 deploy296-b295 deploy298-b296 deploy299-b298 deploy300-b299 deploy301-b300 deploy302-b301 deploy303-b302 deploy304-b303 deploy305-b304 deploy306-b305 deploy307-b306 deploy308-b307 deploy309-b308 deploy310-b309 deploy311-b310 deploy312-b310 deploy313-b312 deploy314-b313 deploy315-b314 deploy316-b315 deploy317-b316 deploy318-b317 deploy319-b318 deploy320-b319 deploy321-b320 deploy322-b321 deploy323-b322 deploy324-b323 deploy325-b324 deploy326-b325 deploy327-b326 deploy328-b327 deploy329-b328 deploy330-b329 deploy331-b330 deploy332-b331 deploy333-b332 deploy334-b333 deploy335-b334 deploy336-b335"
for d in $BASES; do
  ln -sfn $R/deploy336/Web/node_modules $R/$d/Web/node_modules
done
cd $R/deploy336/Web
ROOTS=$R/deploy225-frozen222
for d in $BASES; do
  ROOTS=$ROOTS:$R/$d
done
nice -n 19 env ROLLBACK_BASELINE_ROOTS=$ROOTS node --test tests/rollback-saves.test.js > ../rb336.log 2>&1
echo RB_EXIT=$? >> ../rb336.log
nice -n 19 npm run build > ../build336.log 2>&1
echo BUILD_EXIT=$? >> ../build336.log
nice -n 19 node scripts/verify-assets.mjs --actors assets/manifest-hollow.json --audio audio/manifest.json > ../assets.log 2> ../assets.err
echo ASSETS_EXIT=$? >> ../build336.log
nice -n 19 npm run test:packaging > ../pack336.log 2>&1
echo PACK_EXIT=$? >> ../pack336.log
