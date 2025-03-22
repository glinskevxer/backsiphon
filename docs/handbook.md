# the cross connection control handbook

This file is written by `npm run handbook` out of the tables the program
reads. Do not edit it. Change the catalogue in `src/domain` and run the
script again.

## hazard findings

| code | what it is | degree | scopes | how it travels | air gap only |
| --- | --- | --- | --- | --- | --- |
| AUX_WELL | auxiliary supply from a private well | health | containment | backsiphonage backpressure | no |
| AUX_SURFACE | auxiliary supply from a pond, creek or cistern | health | containment | backsiphonage backpressure | no |
| RECLAIMED | reclaimed or recycled water on the premise | health | containment | backsiphonage backpressure | yes |
| SEWAGE_PUMP | sewage or wastewater pumping equipment | health | containment isolation | backpressure | yes |
| CHEM_BOILER | boiler or chilled water loop with a chemical additive | health | containment isolation | backpressure | no |
| BOILER_PLAIN | boiler with no additive above 180 degrees | nonhealth | isolation | backpressure | no |
| PLATING | metal plating or anodising line | health | containment isolation | backsiphonage backpressure | no |
| MORTUARY | mortuary or autopsy table | health | containment isolation | backsiphonage | no |
| IRRIG_CHEM | irrigation system with a chemical injector | health | containment isolation | backsiphonage backpressure | no |
| IRRIG_PLAIN | irrigation system with no injector | nonhealth | isolation | backsiphonage | no |
| FIRE_ANTIFREEZE | fire system charged with antifreeze or foam | health | containment | backpressure | no |
| FIRE_PLAIN | fire system with no additive and no auxiliary intake | nonhealth | containment | backpressure | no |
| CARBONATOR | beverage carbonator on a copper line | health | isolation | backpressure | no |
| PHOTO_LAB | photographic or film processing bath | health | isolation | backsiphonage | no |
| DOCK_HYDRANT | hose bibb or hydrant at a loading dock | nonhealth | isolation | backsiphonage | no |
| PIER_TIDAL | supply run onto a pier or a moored vessel | health | containment | backsiphonage | no |
| SOLAR_UNTREATED | solar heat exchanger with an untreated transfer fluid | nonhealth | isolation | backpressure | no |
| BOOSTER_PUMP | booster pump taking suction off the service | nonhealth | containment | backpressure | no |
| ELEVATED_TANK | gravity tank above the highest fixture | nonhealth | containment isolation | backpressure | no |
| LAB_BENCH | laboratory bench with submerged fill or vacuum aspirators | health | containment isolation | backsiphonage | no |
| CANNERY | food processing with caustic clean in place | health | containment isolation | backpressure | no |
| CAR_WASH | vehicle wash with detergent reclaim | health | containment | backpressure | no |
| CHILLER_PLAIN | closed chilled water loop with no additive | nonhealth | isolation | backpressure | no |
| HYDRO_JET | sewer jetting or hydro excavation truck fill point | health | containment | backsiphonage | yes |
| COOLING_TOWER | cooling tower with biocide dosing | health | containment isolation | backpressure | no |
| DIALYSIS | dialysis machine or a portable treatment cart | health | isolation | backsiphonage | no |
| DYE_WORKS | textile dye vats | health | containment isolation | backpressure | no |
| BREWERY_CIP | brewery or dairy clean in place set | health | containment isolation | backpressure | no |
| ICE_RINK | ice rink brine plant | health | containment | backpressure | no |
| LAUNDRY | commercial laundry with a chemical dosing rail | health | isolation | backpressure | no |
| FIRE_PUMP_HEADER | fire pump test header discharging to a pond | nonhealth | containment | backsiphonage | no |
| MOBILE_TANK | fill point for a mobile tank or a bowser | health | containment | backsiphonage | yes |

## premise uses

| code | what it is | carries | survey every | walked |
| --- | --- | --- | --- | --- |
| RES_SINGLE | single family home | none | 120 months | yes |
| RES_MULTI | apartment or condominium block | none | 60 months | yes |
| OFFICE | office building | none | 60 months | yes |
| RETAIL | shop or restaurant | none | 36 months | yes |
| SCHOOL | school or college | nonhealth | 36 months | yes |
| HOSPITAL | hospital or clinic | health | 12 months | yes |
| MORTUARY | mortuary or funeral home | health | 12 months | yes |
| LAB | laboratory | health | 12 months | yes |
| PLATING | metal finishing shop | health | 12 months | yes |
| FOOD_PROC | food or beverage processing plant | health | 12 months | yes |
| CAR_WASH | vehicle wash | health | 24 months | yes |
| AGRI | farm or nursery | health | 24 months | yes |
| WWTP | wastewater treatment works | health | 12 months | never |
| INDUSTRIAL | general industrial premise | nonhealth | 24 months | yes |
| WAREHOUSE | warehouse or distribution shed | none | 60 months | yes |
| MARINA | marina or dock | health | 12 months | never |
| BREWERY | brewery or distillery | health | 12 months | yes |
| DAIRY | dairy or creamery | health | 12 months | yes |
| DRY_CLEANER | dry cleaner | health | 24 months | yes |
| ICE_RINK | ice rink | nonhealth | 24 months | yes |
| PRISON | prison or secure unit | health | 12 months | yes |
| HOTEL | hotel | nonhealth | 36 months | yes |
| DATA_CENTRE | data centre | nonhealth | 24 months | yes |
| FUEL_DEPOT | fuel depot or tank farm | health | 12 months | never |
| MUNICIPAL | municipal yard or depot | nonhealth | 36 months | yes |

## assembly classes

| code | what it is | health | backpressure | detector | field tested | stands in for |
| --- | --- | --- | --- | --- | --- | --- |
| AG | air gap | yes | yes | yes | no | AG |
| RP | reduced pressure principle assembly | yes | yes | no | yes | AG RP RPDA |
| RPDA | reduced pressure principle detector assembly | yes | yes | yes | yes | AG RPDA |
| DC | double check valve assembly | no | yes | no | yes | AG RP RPDA DC DCDA |
| DCDA | double check detector assembly | no | yes | yes | yes | AG RPDA DCDA |
| PVB | pressure vacuum breaker | yes | no | no | yes | AG RP RPDA PVB SVB |
| SVB | spill resistant vacuum breaker | yes | no | no | yes | AG SVB |
| AVB | atmospheric vacuum breaker | yes | no | no | no | AG RP RPDA PVB SVB AVB |

## field procedures

| class | reading | what it is | passes at |
| --- | --- | --- | --- |
| AG | separationInches | vertical separation from the flood rim | at least 4 |
| RP | check1Differential | differential across the first check | at least 5 |
| RP | reliefOpening | differential at which the relief valve opens | at least 2 |
| RP | check1Differential over reliefOpening | the first check has to hold a margin above the relief opening point | at least 3 |
| RPDA | check1Differential | differential across the first check | at least 5 |
| RPDA | reliefOpening | differential at which the relief valve opens | at least 2 |
| RPDA | bypassTight | bypass meter and its assembly hold | holds or does not |
| RPDA | check1Differential over reliefOpening | the first check has to hold a margin above the relief opening point | at least 3 |
| DC | check1Differential | differential across the first check | at least 1 |
| DC | check2Differential | differential across the second check | at least 1 |
| DCDA | check1Differential | differential across the first check | at least 1 |
| DCDA | check2Differential | differential across the second check | at least 1 |
| DCDA | bypassTight | bypass meter and its assembly hold | holds or does not |
| PVB | airInletOpening | differential at which the air inlet opens | at least 1 |
| PVB | check1Differential | differential across the first check | at least 1 |
| SVB | airInletOpening | differential at which the air inlet opens | at least 1 |
| SVB | check1Differential | differential across the first check | at least 1 |
| SVB | ventTight | vent holds without weeping | holds or does not |
| AVB | no field procedure |  |  |

## notice ladders

| ladder | notice | when |
| --- | --- | --- |
| standard | first | 0 days past due |
| standard | second | 30 days past due |
| standard | final | 45 days past due |
| standard | shutoff | 60 days past due |
| health hazard | first | 0 days past due |
| health hazard | second | 15 days past due |
| health hazard | final | 25 days past due |
| health hazard | shutoff | 30 days past due |

## annual fees

| band | size | double check | reduced pressure | air gap |
| --- | --- | --- | --- | --- |
| B1 | up to one inch | 42.00 | 52.50 | 21.00 |
| B2 | over one up to two inches | 78.00 | 97.50 | 39.00 |
| B3 | over two up to four inches | 145.00 | 181.25 | 72.50 |
| B4 | over four up to eight inches | 260.00 | 325.00 | 130.00 |
| B5 | over eight inches | 410.00 | 512.50 | 205.00 |

