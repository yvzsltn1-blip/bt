# import libraries
import math
import random

######### your input #########
# enemy units
skeletons          =  9
zombies            = 12
cultists           = 19
bonewings          = 12
corpses            = 20
wraiths            = 13
revenants          =  5
giants             =  5
broodmothers       =  6
liches             =  7

# ally units
bats               = 48
ghouls             = 79
thralls            = 20
banshees           =  7
necromancers       =  1
gargoyles          =  5
witches            =  1
rotmaws            =  2


########## the code ##########
# extra units
revived            =  0
spiderlings        =  0

# all unit indexes
skeletons_index    =  0
zombies_index      =  1
cultists_index     =  2
bonewings_index    =  3
corpses_index      =  4
wraiths_index      =  5
revenants_index    =  6
giants_index       =  7
broodmothers_index =  8
liches_index       =  9
bats_index         = 10
ghouls_index       = 11
thralls_index      = 12
banshees_index     = 13
necromancers_index = 14
gargoyles_index    = 15
witches_index      = 16
rotmaws_index      = 17
revived_index      = 18
spiderlings_index  = 19

# all unit description indexes
name_index         =  0
side_index         =  1
type_index         =  2
position_index     =  3
attack_index       =  4
health_index       =  5
speed_index        =  6
space_index        =  7
blood_index        =  8

# all unit description properties
# 0-name, 1-side, 2-type, 3-position, 4-attack, 5-health, 6-speed, 7-space, 8-blood
unit_desc = [["skeletons",           "enemy", "brute",   "front",  3,  4, 3],
             ["zombies",             "enemy", "brute",   "front",  2,  7, 2],
             ["immortal cultists",   "enemy", "occult",  "rear",   5,  1, 1],
             ["bonewings",           "enemy", "occult",  "rear",   6,  3, 4],
             ["bloated corpses",     "enemy", "monster", "front",  1, 10, 1],
             ["wraiths",             "enemy", "occult",  "rear",   7,  2, 4],
             ["revenants",           "enemy", "brute",   "front",  8, 12, 4],
             ["bone giants",         "enemy", "monster", "front", 10, 25, 1],
             ["broodmothers",        "enemy", "monster", "rear",   9, 18, 2],
             ["liches",              "enemy", "occult",  "rear",  40, 25, 3],
             ["bats",                "ally",  "brute",   "rear",   8,  2, 5,  2,  10],
             ["ghouls",              "ally",  "brute",   "front",  3,  5, 2,  3,  15],
             ["vampire thralls",     "ally",  "occult",  "front",  6,  6, 4,  4,  20],
             ["banshees",            "ally",  "monster", "rear",   7,  4, 4,  7,  35],
             ["necromancers",        "ally",  "occult",  "rear",   9,  5, 2, 10,  50],
             ["gargoyles",           "ally",  "monster", "front", 12, 12, 3, 15,  75],
             ["blood witches",       "ally",  "occult",  "rear",  14,  8, 3, 18,  90],
             ["rotmaws",             "ally",  "monster", "front", 30, 90, 1, 30, 150],
             ["revived zombies",     "enemy", "brute",   "front",  2,  1, 2],
             ["spiderlings",         "enemy", "monster", "rear",   1,  1, 6]]


# initialize attacker order
attacker_order = []
for i in reversed(range(7)):  # reversed order to select attacker units from highest to lowest speed
    for j in reversed(range(len(unit_desc))):  # reversed order to select attacker units from highest to lowest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "ally") & (unit_desc[j][position_index] == "rear"):
            attacker_order.append(j)
    for j in reversed(range(len(unit_desc))):  # reversed order to select attacker units from highest to lowest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "rear"):
            attacker_order.append(j)
    for j in reversed(range(len(unit_desc))):  # reversed order to select attacker units from highest to lowest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "ally") & (unit_desc[j][position_index] == "front"):
            attacker_order.append(j)
    for j in reversed(range(len(unit_desc))):  # reversed order to select attacker units from highest to lowest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "front"):
            attacker_order.append(j)

# initialize defender orders
defender_order_front = []
for i in range(7):  # normal order to select defender units from lowest to highest speed
    for j in range(len(unit_desc)):  # normal order to select defender units from lowest to highest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "front"):
            defender_order_front.append(j)
    for j in range(len(unit_desc)):  # normal order to select defender units from lowest to highest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "ally") & (unit_desc[j][position_index] == "front"):
            defender_order_front.append(j)

defender_order_rear = []
for i in range(7):
    for j in range(len(unit_desc)):  # normal order to select defender units from lowest to highest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "rear"):
            defender_order_rear.append(j)
    for j in range(len(unit_desc)):  # normal order to select defender units from lowest to highest tier
        if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "ally") & (unit_desc[j][position_index] == "rear"):
            defender_order_rear.append(j)

defender_order_front_first = []
defender_order_rear_first = []
defender_order = []
for i in range(len(defender_order_front)):
    defender_order_front_first.append(defender_order_front[i])
for i in range(len(defender_order_rear)):
    defender_order_front_first.append(defender_order_rear[i])
    defender_order_rear_first.append(defender_order_rear[i])
for i in range(len(defender_order_front)):
    defender_order_rear_first.append(defender_order_front[i])

# initialize unit numbers
unit_numbers_initial = [skeletons, zombies, cultists, bonewings, corpses, wraiths, revenants, giants, broodmothers, liches,
                        bats, ghouls, thralls, banshees, necromancers, gargoyles, witches, rotmaws, revived, spiderlings]

unit_numbers = [skeletons, zombies, cultists, bonewings, corpses, wraiths, revenants, giants, broodmothers, liches,
                bats, ghouls, thralls, banshees, necromancers, gargoyles, witches, rotmaws, revived, spiderlings]

# initialize unit health
unit_health = []
for i in range(len(unit_numbers)):
    unit_health.append(unit_numbers[i] * unit_desc[i][health_index])

# initialize unit speed
unit_speed = []
for i in range(len(unit_desc)):
    unit_speed.append(unit_desc[i][speed_index])

# initialize unit damage buffs
unit_buff = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
             1, 1, 1, 1, 1, 1, 1, 1, 1, 1]

# initialize battle variables
round_count = 0
turn_count = 0
enemy_capable = True
ally_capable = True

# gargoyles ability: initialize speed reduction event
gargoyles_reduce_event = False


# print initial battlefield positions
print("--------------------------------------------------")
print("round: {0}, turn: {1}".format(round_count, turn_count))
print("- initial battlefield positions")
print("")

for i in reversed(range(len(defender_order_front_first))):
    if (unit_numbers[defender_order_front_first[i]] > 0) & (unit_desc[defender_order_front_first[i]][side_index] == "enemy"):
        print("{0:3d} {1:20s} {2:4d} hp".format(unit_numbers[defender_order_front_first[i]], unit_desc[defender_order_front_first[i]][name_index], unit_health[defender_order_front_first[i]]))

print("")

for i in range(len(defender_order_front_first)):
    if (unit_numbers[defender_order_front_first[i]] > 0) & (unit_desc[defender_order_front_first[i]][side_index] == "ally"):
        print("{0:3d} {1:20s} {2:4d} hp".format(unit_numbers[defender_order_front_first[i]], unit_desc[defender_order_front_first[i]][name_index], unit_health[defender_order_front_first[i]]))

print("--------------------------------------------------")

# simulate battle rounds until one side loses all units
while enemy_capable & ally_capable:

    # reset battle variables
    round_count += 1
    turn_count = 0
    enemy_capable = False
    ally_capable = False

    # check for enemy capable units
    for j in range(len(unit_numbers)):
        if (unit_numbers[j] > 0) & (unit_desc[j][side_index] == "enemy"):
            enemy_capable = True
            break

    if not enemy_capable:
        print("enemy lost")
        break

    # check for ally capable units
    for j in range(len(unit_numbers)):
        if (unit_numbers[j] > 0) & (unit_desc[j][side_index] == "ally"):
            ally_capable = True
            break

    if not ally_capable:
        print("ally lost")
        break

    # banshees ability: apply -25% damage reduction to targeted enemy unit
    banshees_reduce_round = -1
    banshees_reduce_target = -1

    # gargoyles ability: if attacked in previous round, recalculate attacker order for the next round
    if gargoyles_reduce_event:

        # recalculate attacker order
        attacker_order = []
        for k in reversed(range(-15, 7)):  # reversed order to select attacker units from highest to lowest speed
            for l in reversed(range(len(unit_speed))):  # reversed order to select attacker units from highest to lowest tier
                if (unit_speed[l] == k) & (unit_desc[l][side_index] == "ally") & (unit_desc[l][position_index] == "rear"):
                    attacker_order.append(l)
            for l in reversed(range(len(unit_speed))):  # reversed order to select attacker units from highest to lowest tier
                if (unit_speed[l] == k) & (unit_desc[l][side_index] == "enemy") & (unit_desc[l][position_index] == "rear"):
                    attacker_order.append(l)
            for l in reversed(range(len(unit_speed))):  # reversed order to select attacker units from highest to lowest tier
                if (unit_speed[l] == k) & (unit_desc[l][side_index] == "ally") & (unit_desc[l][position_index] == "front"):
                    attacker_order.append(l)
            for l in reversed(range(len(unit_speed))):  # reversed order to select attacker units from highest to lowest tier
                if (unit_speed[l] == k) & (unit_desc[l][side_index] == "enemy") & (unit_desc[l][position_index] == "front"):
                    attacker_order.append(l)

        # reset speed reduction event
        gargoyles_reduce_event = False

    # simulate battle turns
    for j in range(len(attacker_order)):

        # find attacker and defender unit
        attacker_index = -1
        defender_index = -1
        found_attacker = False
        found_defender = False

        # find capable attacker unit
        if unit_numbers[attacker_order[j]] > 0:
            attacker_index = attacker_order[j]
            found_attacker = True

        # find capable defender unit
        if found_attacker:

            # specify attacker unit side
            attacker_side = unit_desc[attacker_index][side_index]

            # specify defender unit side
            defender_side = ""
            if attacker_side == "ally":
                defender_side = "enemy"
            if attacker_side == "enemy":
                defender_side = "ally"

            # specify defender order
            defender_order = defender_order_front_first

            # bonewings ability: attack rear units first
            if attacker_index == bonewings_index:
                defender_order = defender_order_rear_first

            # banshees ability: attack rear units first
            if attacker_index == banshees_index:
                defender_order = defender_order_rear_first

            # find capable defender unit
            for l in range(len(defender_order)):
                if (unit_numbers[defender_order[l]] > 0) & (unit_desc[defender_order[l]][side_index] == defender_side):
                    defender_index = defender_order[l]
                    found_defender = True
                    break

        # simulate battle turn
        if found_defender:

            # count battle turn
            turn_count += 1
            print("round: {0}, turn: {1}".format(round_count, turn_count))

            # utilize unit type variables
            damage_multiplier = 1.00
            attacker_type = unit_desc[attacker_index][type_index]
            defender_type = unit_desc[defender_index][type_index]

            # revenants ability: announce -15% damage reduction to attacking ally rear unit
            if unit_numbers[revenants_index] > 0:
                if (unit_desc[attacker_index][side_index] == "ally") & (unit_desc[attacker_index][position_index] == "rear"):
                    print("- {0} reduce {1} damage by -15%".format(unit_desc[revenants_index][name_index], unit_desc[attacker_index][name_index]))

            # bonewings ability: attack rear units first
            if (attacker_index == bonewings_index) & (unit_desc[defender_index][side_index] == "ally") & (unit_desc[defender_index][position_index] == "rear"):
                print("- {0} bypass ally front units and attack ally rear units".format(unit_desc[bonewings_index][name_index]))

            # banshees ability: attack rear units first
            if (attacker_index == banshees_index) & (unit_desc[defender_index][side_index] == "enemy") & (unit_desc[defender_index][position_index] == "rear"):
                print("- {0} bypass enemy front units and attack enemy rear units".format(unit_desc[banshees_index][name_index]))

            # apply unit type multiplier
            if (attacker_type == "brute") & (defender_type == "occult"):
                damage_multiplier = 1.50
                print("- {0} have type advantage against {1} and gain +50% damage increase".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))

            if (attacker_type == "brute") & (defender_type == "monster"):
                damage_multiplier = 0.50
                print("- {0} have type disadvantage against {1} and gain -50% damage reduction".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))

            if (attacker_type == "occult") & (defender_type == "brute") & (defender_index != ghouls_index) & (attacker_index != wraiths_index):
                damage_multiplier = 0.50
                print("- {0} have type disadvantage against {1} and gain -50% damage reduction".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))

            if (attacker_type == "occult") & (defender_type == "monster") & (attacker_index != wraiths_index):
                damage_multiplier = 1.50
                print("- {0} have type advantage against {1} and gain +50% damage increase".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))

            if (attacker_type == "monster") & (defender_type == "brute") & (defender_index != ghouls_index) & (attacker_index != rotmaws_index):
                damage_multiplier = 1.50
                print("- {0} have type advantage against {1} and gain +50% damage increase".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))

            if (attacker_type == "monster") & (defender_type == "occult") & (attacker_index != rotmaws_index):
                damage_multiplier = 0.50
                print("- {0} have type disadvantage against {1} and gain -50% damage reduction".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))

            # wraiths ability: ignore unit typing
            if attacker_index == wraiths_index:
                damage_multiplier = 1.00
                print("- {0} ignore unit typing".format(unit_desc[wraiths_index][name_index]))

            # ghouls ability: -50% damage intake regardless of enemy type
            if defender_index == ghouls_index:
                damage_multiplier = 0.50
                print("- {0} attack {1} with -50% damage reduction".format(unit_desc[attacker_index][name_index], unit_desc[ghouls_index][name_index]))

            # rotmaws ability: ignore unit typing
            if attacker_index == rotmaws_index:
                damage_multiplier = 1.00
                print("- {0} ignore unit typing".format(unit_desc[rotmaws_index][name_index]))

            # store unit numbers before attack
            unit_numbers_before = []
            for l in range(len(unit_numbers)):
                unit_numbers_before.append(unit_numbers[l])

            # bonewings ability: apply +20% damage if attacking first in any round
            if (attacker_index == bonewings_index) & (turn_count == 1):
                damage_multiplier *= 1.20
                print("- {0} attack first in round with +20% damage increase".format(unit_desc[attacker_index][name_index]))

            # wraiths ability: gain +50% damage increase for each time the targeted ally unit has double or multiple size compared to own size
            if attacker_index == wraiths_index:
                wraiths_damage_multiplier = 1.00
                ally_unit_numbers = unit_numbers[defender_index]
                while ally_unit_numbers >= 2 * unit_numbers[wraiths_index]:
                    wraiths_damage_multiplier += 0.50
                    ally_unit_numbers -= unit_numbers[wraiths_index]
                damage_multiplier *= wraiths_damage_multiplier
                print("- {0} gain {1:.2f} damage multiplier".format(unit_desc[wraiths_index][name_index], wraiths_damage_multiplier))

            # revenants ability: if alive, apply -15% damage reduction to all ally rear units
            if unit_numbers[revenants_index] > 0:
                if (unit_desc[attacker_index][side_index] == "ally") & (unit_desc[attacker_index][position_index] == "rear"):
                    damage_multiplier *= 0.85

            # bats ability: apply +25% damage increase in first round
            if (attacker_index == bats_index) & (round_count == 1):
                damage_multiplier *= 1.25
                print("- {0} attack with +25% damage increase in first round".format(unit_desc[bats_index][name_index]))

            # vampire thralls ability: apply +33% damage increase to slow enemy units (speed < 3)
            if (attacker_index == thralls_index) & (unit_speed[defender_index] < 3):
                damage_multiplier *= 1.33
                print("- {0} attack slow enemy unit with +33% damage increase".format(unit_desc[thralls_index][name_index]))

            # banshees ability: apply -25% damage reduction to the targeted enemy unit
            if attacker_index == banshees_index:
                banshees_reduce_round = round_count
                banshees_reduce_target = defender_index
                print("- {0} reduce {1} damage by -25%".format(unit_desc[banshees_index][name_index], unit_desc[banshees_reduce_target][name_index]))
            if (banshees_reduce_round == round_count) & (attacker_index == banshees_reduce_target):
                damage_multiplier *= 0.75
                print("- {0} attack with -25% damage reduction".format(unit_desc[attacker_index][name_index]))

            # necromancers ability: gain +10% damage increase for each defeated unit group
            if attacker_index == necromancers_index:
                necromancers_multiply_percent = int(unit_buff[necromancers_index] * 100)
                print("- {0} attack with +{1}% damage".format(unit_desc[necromancers_index][name_index], necromancers_multiply_percent))

            # bone giants ability: announce their damage multiplier
            if attacker_index == giants_index:
                giants_multiply_percent = int(unit_buff[giants_index] * 100)
                print("- {0} attack with +{1}% damage".format(unit_desc[giants_index][name_index], giants_multiply_percent))

            # liches ability: if they defeat an ally front unit, they also deal 50% of dealt damage to the slowest ally rear unit
            liches_splash_damage = 0

            # blood witches ability: deal 25% of dealt damage to all enemy rear units on every second round
            witches_splash_damage = 0

            # rotmaws ability: if they defeat an enemy unit, transfer overkill damage to the next enemy unit
            rotmaws_overkill_damage = 0

            # apply attacker damage
            attacker_damage = round(unit_numbers[attacker_index] * unit_desc[attacker_index][attack_index] * damage_multiplier * unit_buff[attacker_index] + 0.001)
            unit_health[defender_index] -= attacker_damage
            print("- {0} attack {1} with {2} damage".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index], attacker_damage))


            # gargoyles ability: reduce attacking enemy unit speed by -2
            if defender_index == gargoyles_index:
                gargoyles_reduce_event = True
                unit_speed[attacker_index] -= 2
                print("- {0} reduce {1} speed by -2".format(unit_desc[gargoyles_index][name_index], unit_desc[attacker_index][name_index], unit_speed[attacker_index]))
                print("- {0} now have {1} speed".format(unit_desc[attacker_index][name_index], unit_speed[attacker_index]))

                # recalculate defender orders
                defender_order_front = []
                for m in range(-15, 7):  # normal order to select defender units from lowest to highest speed
                    for n in range(len(unit_speed)):  # normal order to select defender units from lowest to highest tier
                        if (unit_speed[n] == m) & (unit_desc[n][side_index] == "enemy") & (unit_desc[n][position_index] == "front"):
                            defender_order_front.append(n)
                    for n in range(len(unit_speed)):  # normal order to select defender units from lowest to highest tier
                        if (unit_speed[n] == m) & (unit_desc[n][side_index] == "ally") & (unit_desc[n][position_index] == "front"):
                            defender_order_front.append(n)

                defender_order_rear = []
                for m in range(-15, 7):
                    for n in range(len(unit_speed)):  # normal order to select defender units from lowest to highest tier
                        if (unit_speed[n] == m) & (unit_desc[n][side_index] == "enemy") & (unit_desc[n][position_index] == "rear"):
                            defender_order_rear.append(n)
                    for n in range(len(unit_speed)):  # normal order to select defender units from lowest to highest tier
                        if (unit_speed[n] == m) & (unit_desc[n][side_index] == "ally") & (unit_desc[n][position_index] == "rear"):
                            defender_order_rear.append(n)

                defender_order_front_first = []
                defender_order_rear_first = []
                for m in range(len(defender_order_front)):
                    defender_order_front_first.append(defender_order_front[m])
                for m in range(len(defender_order_rear)):
                    defender_order_front_first.append(defender_order_rear[m])
                    defender_order_rear_first.append(defender_order_rear[m])
                for m in range(len(defender_order_front)):
                    defender_order_rear_first.append(defender_order_front[m])

            # blood witches ability: on every second round, store 25% of dealt damage as splash damage value
            if (attacker_index == witches_index) & (unit_numbers[witches_index] > 0) & ((round_count % 2) == 0):
                witches_splash_damage = round(attacker_damage * 0.25 + 0.001)

            # if defender unit health goes below zero
            if unit_health[defender_index] <= 0:

                # liches ability: if they defeat an ally front unit, store 50% of dealt damage as splash damage value
                if attacker_index == liches_index:
                    liches_splash_damage = round(attacker_damage * 0.50 + 0.001)

                # rotmaws ability: if they defeat an enemy unit, store overkill damage value
                if attacker_index == rotmaws_index:
                    rotmaws_overkill_damage = unit_health[defender_index] * (-1)

                # set defeated unit health to 0
                unit_health[defender_index] = 0
                print("- {0} are defeated".format(unit_desc[defender_index][name_index]))

            # recalculate remaining unit numbers
            unit_numbers[defender_index] = math.ceil(float(unit_health[defender_index]) / float(unit_desc[defender_index][health_index]))

            # liches ability: find next ally rear unit and apply splash damage
            if liches_splash_damage > 0:
                for m in range(len(defender_order)):
                    if (unit_numbers[defender_order[m]] > 0) & (unit_desc[defender_order[m]][side_index] == "ally") & (unit_desc[defender_order[m]][position_index] == "rear"):
                        unit_health[defender_order[m]] -= liches_splash_damage
                        print("- {0} attack {1} with {2} splash damage".format(unit_desc[liches_index][name_index], unit_desc[defender_order[m]][name_index], liches_splash_damage))
                        if unit_health[defender_order[m]] <= 0:
                            unit_health[defender_order[m]] = 0
                            print("- {0} are defeated".format(unit_desc[defender_order[m]][name_index]))

                        # recalculate remaining unit numbers
                        unit_numbers[defender_order[m]] = math.ceil(float(unit_health[defender_order[m]]) / float(unit_desc[defender_order[m]][health_index]))
                        break

            # blood witches ability: find all enemy rear units and apply splash damage
            if witches_splash_damage > 0:
                for m in range(len(defender_order)):
                    if (unit_numbers[defender_order[m]] > 0) & (unit_desc[defender_order[m]][side_index] == "enemy") & (unit_desc[defender_order[m]][position_index] == "rear"):
                        unit_health[defender_order[m]] -= witches_splash_damage
                        print("- {0} attack {1} with {2} splash damage".format(unit_desc[witches_index][name_index], unit_desc[defender_order[m]][name_index], witches_splash_damage))
                        if unit_health[defender_order[m]] <= 0:
                            unit_health[defender_order[m]] = 0
                            print("- {0} are defeated".format(unit_desc[defender_order[m]][name_index]))

                        # recalculate remaining unit numbers
                        unit_numbers[defender_order[m]] = math.ceil(float(unit_health[defender_order[m]]) / float(unit_desc[defender_order[m]][health_index]))

            # rotmaws ability: find next enemy defender unit and apply overkill damage
            if rotmaws_overkill_damage > 0:
                for m in range(len(defender_order)):
                    if (unit_numbers[defender_order[m]] > 0) & (unit_desc[defender_order[m]][side_index] == "enemy"):
                        unit_health[defender_order[m]] -= rotmaws_overkill_damage
                        print("- {0} attack {1} with {2} overkill damage".format(unit_desc[rotmaws_index][name_index], unit_desc[defender_order[m]][name_index], rotmaws_overkill_damage))
                        if unit_health[defender_order[m]] <= 0:
                            unit_health[defender_order[m]] = 0
                            print("- {0} are defeated".format(unit_desc[defender_order[m]][name_index]))

                        # recalculate remaining unit numbers
                        unit_numbers[defender_order[m]] = math.ceil(float(unit_health[defender_order[m]]) / float(unit_desc[defender_order[m]][health_index]))
                        break

            # zombies ability: revive with 1 hp when defeated
            zombies_numbers_diff = unit_numbers_before[zombies_index] - unit_numbers[zombies_index]
            if (zombies_numbers_diff > 0) & (unit_numbers[zombies_index] == 0):
                unit_numbers[revived_index] = zombies
                unit_health[revived_index] = zombies * unit_desc[revived_index][health_index]
                print("- {0} revive back with 1 health each".format(unit_desc[zombies_index][name_index]))

            # immortal cultists ability: apply +10% damage increase to other random enemy unit
            if (attacker_index == cultists_index) & (unit_numbers[cultists_index] > 0):

                # populate candidates to gain cultists damage buff
                cultists_buff_candidates = []
                for m in range(len(unit_numbers)):
                    if (unit_numbers[m] > 0) & (unit_desc[m][side_index] == "enemy") & (m != cultists_index):
                        cultists_buff_candidates.append(m)

                # apply cultists damage buff
                if len(cultists_buff_candidates):
                    random_unit_index = random.choice(cultists_buff_candidates)
                    unit_buff[random_unit_index] += 0.10
                    print("- {0} buff {1} with +10% damage increase".format(unit_desc[cultists_index][name_index], unit_desc[random_unit_index][name_index]))
                    print("- {0} now have {1}% damage".format(unit_desc[random_unit_index][name_index], int(unit_buff[random_unit_index] * 100)))

            # bloated corpses ability: if defeated, retaliate against ally attacker unit with 20% of own total health
            corpses_numbers_diff = unit_numbers_before[corpses_index] - unit_numbers[corpses_index]
            if (corpses_numbers_diff > 0) & (unit_numbers[corpses_index] == 0):
                corpses_damage = math.ceil(corpses * unit_desc[corpses_index][health_index] * 0.20)

                # apply retaliation damage
                unit_health[attacker_index] -= corpses_damage
                print("- {0} retaliate against {1} with {2} damage".format(unit_desc[corpses_index][name_index], unit_desc[attacker_index][name_index], corpses_damage))
                if unit_health[attacker_index] <= 0:
                    unit_health[attacker_index] = 0
                    print("- {0} are defeated".format(unit_desc[attacker_index][name_index]))

                # recalculate remaining unit numbers
                unit_numbers[attacker_index] = math.ceil(float(unit_health[attacker_index]) / float(unit_desc[attacker_index][health_index]))

            # bone giants ability: stack +5% damage for every tackle by any ally unit
            if (defender_index == giants_index) & (unit_numbers[giants_index] > 0):
                unit_buff[giants_index] += 0.05
                print("- {0} gain +5% damage increase".format(unit_desc[giants_index][name_index], int(unit_buff[giants_index] * 100)))
                print("- {0} now have {1}% damage".format(unit_desc[giants_index][name_index], int(unit_buff[giants_index] * 100)))

            # bone giants ability: reset damage multiplier after attacking an ally unit
            if attacker_index == giants_index:
                unit_buff[giants_index] = 1
                print("- bone giants stacked damage is reset to {0}%".format(int(unit_buff[giants_index]) * 100))

            # necromancers ability: gain +10% damage increase for every defeated unit in battle
            if unit_numbers[necromancers_index] > 0:
                for m in range(len(unit_numbers)):
                    if ((unit_numbers_before[m] - unit_numbers[m]) > 0) & (unit_numbers[m] == 0):
                        unit_buff[necromancers_index] += 0.10
                        print("- {0} gain +10% damage increase for defeated {1}".format(unit_desc[necromancers_index][name_index], unit_desc[m][name_index], int(unit_buff[necromancers_index] * 100)))
                        print("- {0} now have {1}% damage".format(unit_desc[necromancers_index][name_index], int(unit_buff[necromancers_index] * 100)))

            # broodmothers ability: if alive, spawn 10 spiderlings at the end of each round
            detected_next_attacker_unit = False
            for l in range(j + 1, len(unit_numbers) - 1):
                if unit_numbers[attacker_order[l]] > 0:
                    detected_next_attacker_unit = True

            if (not detected_next_attacker_unit) & (unit_numbers[broodmothers_index] > 0):
                unit_numbers[spiderlings_index] += 10
                unit_health[spiderlings_index] += 10 * unit_desc[spiderlings_index][health_index]
                print("- {0} spawn 10 more {1}".format(unit_desc[broodmothers_index][name_index], unit_desc[spiderlings_index][name_index]))


            # print battlefield positions
            print("")

            for l in reversed(range(len(defender_order_front_first))):
                if (unit_numbers[defender_order_front_first[l]] > 0) & (unit_desc[defender_order_front_first[l]][side_index] == "enemy"):
                    print("{0:3d} {1:20s} {2:4d} hp".format(unit_numbers[defender_order_front_first[l]], unit_desc[defender_order_front_first[l]][name_index], unit_health[defender_order_front_first[l]]))

            print("")

            for l in range(len(defender_order_front_first)):
                if (unit_numbers[defender_order_front_first[l]] > 0) & (unit_desc[defender_order_front_first[l]][side_index] == "ally"):
                    print("{0:3d} {1:20s} {2:4d} hp".format(unit_numbers[defender_order_front_first[l]], unit_desc[defender_order_front_first[l]][name_index], unit_health[defender_order_front_first[l]]))

            print("--------------------------------------------------")


# count lost units
print("--------------------------------------------------")
print("units lost")

lost_units_total = 0
lost_blood_total = 0
for i in range(bats_index, revived_index):
    lost_units = unit_numbers_initial[i] - unit_numbers[i]
    if lost_units > 0:
        lost_units_total += lost_units
        lost_blood = lost_units * unit_desc[i][blood_index]
        lost_blood_total += lost_blood
        print("- {0:3d} {1:20s} ({2:4d} blood)".format(lost_units, unit_desc[i][name_index], lost_blood))

print("")
print("= {0:3d} total {1:14s} ({2:4d} blood)".format(lost_units_total, "", lost_blood_total))
print("--------------------------------------------------")

capacity = 0
for i in range(bats_index, revived_index):
    capacity += unit_numbers_initial[i] * unit_desc[i][space_index]
print("unit capacity: {0}".format(capacity))
print("--------------------------------------------------")
