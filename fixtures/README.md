# Inspection fixtures

Ten still photos of ordinary building-safety subjects, used for the measurement
gate and for the one-click sample walkthrough. None of them is the user's
building, so the repository can be public.

Each photo keeps its own licence. The app code is Apache-2.0; these files are not.

| file | subject | licence | author | source |
|---|---|---|---|---|
| extinguisher.jpg | red extinguisher inside a glass fronted wall cabinet | CC BY 3.0 | Mibrahim74 | https://commons.wikimedia.org/wiki/File:Fire_extinguisher_in_wall_mount.jpg |
| exit-sign.jpg | illuminated green exit sign above a door | CC BY 4.0 | User:HarJIT | https://commons.wikimedia.org/wiki/File:Emergency_exit_UK_001.jpg |
| panel.jpg | distribution board with the cover removed and wiring exposed | CC BY-SA 4.0 | OathOn | https://commons.wikimedia.org/wiki/File:Electrical_distribution_board_with_circuit_breakers_and_wiring,_abandoned_Buzz_Bingo_(former_Ritz_Cinema),_Chatham,_Kent,_England_(2025-05-11).png |
| crack.jpg | cracked blockwork with spalled face and exposed reinforcement | CC BY-SA 3.0 | JonRichfield | https://commons.wikimedia.org/wiki/File:Concrete_wall_cracking_as_its_steel_reinforcing_cracks_and_swells_9061.jpg |
| extinguisher-cart.jpg | extinguisher on a wheeled cart outdoors, weathered, not mounted | CC BY 2.0 | Shixart1985 | https://commons.wikimedia.org/wiki/File:Fire_extinguisher_on_a_cart_in_an_industrial_area_during_day_time_with_a_brick_wall_in_the_background.jpg |
| blocked-exit.jpg | pallets of stock stacked in front of a fire exit door | CC0 | Xzkdeng | https://commons.wikimedia.org/wiki/File:Blocked_exit_in_Songjiang,_Shanghai_16_Feb_2026.jpg |
| hose-reel.jpg | red fire hose reel with its sign, valve and riser | CC BY-SA 4.0 | Kgbo | https://commons.wikimedia.org/wiki/File:Fire_Hose_Reel_and_Fire_Hydrant_in_Brisbane,_Australia.jpg |
| smoke-detector.jpg | ceiling smoke detector with paint on the casing | Public domain | Georg Pik | https://commons.wikimedia.org/wiki/File:Smoke_detector_(1).JPG |
| sprinkler.jpg | sprinkler head in a protective cage, paint on the frame | CC BY-SA 4.0 | ArnoldReinhold | https://commons.wikimedia.org/wiki/File:Sprinkler_head_NH.agr.jpg |
| fire-door.jpg | sliding fire door closed, with a step ladder and an extinguisher against the frame | CC BY-SA 3.0 | Clem Rutter, Rochester, Kent | https://commons.wikimedia.org/wiki/File:Queen_Street_Mill_self_closing_fire-door_8617.JPG |

Files were resized to fit inside 1024 px and re-encoded as JPEG quality 85. No
other change was made.

`ground-truth.json` holds the answer a careful human wrote down before the model
ran. It is the baseline for the per-photo quality score, so edit it only with a
reason written next to the change. The vision gate used the first five; the five
added on 2026-11-23 extend the same key and the sample walkthrough.
