import io
import math
import random
import tkinter as tk
from contextlib import redirect_stdout
from tkinter import ttk, font, messagebox


# ---------------------------------------------------------------------------
# Simulation logic (refactored from bt.py into a pure function)
# ---------------------------------------------------------------------------
def simulate_battle(enemy_counts, ally_counts):
    skeletons    = enemy_counts["skeletons"]
    zombies      = enemy_counts["zombies"]
    cultists     = enemy_counts["cultists"]
    bonewings    = enemy_counts["bonewings"]
    corpses      = enemy_counts["corpses"]
    wraiths      = enemy_counts["wraiths"]
    revenants    = enemy_counts["revenants"]
    giants       = enemy_counts["giants"]
    broodmothers = enemy_counts["broodmothers"]
    liches       = enemy_counts["liches"]

    bats         = ally_counts["bats"]
    ghouls       = ally_counts["ghouls"]
    thralls      = ally_counts["thralls"]
    banshees     = ally_counts["banshees"]
    necromancers = ally_counts["necromancers"]
    gargoyles    = ally_counts["gargoyles"]
    witches      = ally_counts["witches"]
    rotmaws      = ally_counts["rotmaws"]

    revived = 0
    spiderlings = 0

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

    name_index     = 0
    side_index     = 1
    type_index     = 2
    position_index = 3
    attack_index   = 4
    health_index   = 5
    speed_index    = 6
    space_index    = 7
    blood_index    = 8

    unit_desc = [["İskeletler (T1)",         "enemy", "brute",   "front",  3,  4, 3],
                 ["Zombiler (T2)",           "enemy", "brute",   "front",  2,  7, 2],
                 ["Ölümsüz Tarikatçılar (T3)","enemy", "occult",  "rear",   5,  1, 1],
                 ["Kemik Kanatlar (T4)",     "enemy", "occult",  "rear",   6,  3, 4],
                 ["Şişmiş Cesetler (T5)",    "enemy", "monster", "front",  1, 10, 1],
                 ["Hayaletler (T6)",         "enemy", "occult",  "rear",   7,  2, 4],
                 ["Hortlaklar (T7)",         "enemy", "brute",   "front",  8, 12, 4],
                 ["Kemik Devler (T8)",       "enemy", "monster", "front", 10, 25, 1],
                 ["Yavrulayan Analar (T9)",  "enemy", "monster", "rear",   9, 18, 2],
                 ["Lichler (T10)",           "enemy", "occult",  "rear",  40, 25, 3],
                 ["Yarasalar (T1)",          "ally",  "brute",   "rear",   8,  2, 5,  2,  10],
                 ["Gulyabaniler (T2)",       "ally",  "brute",   "front",  3,  5, 2,  3,  15],
                 ["Vampir Köleler (T3)",     "ally",  "occult",  "front",  6,  6, 4,  4,  20],
                 ["Banşiler (T4)",           "ally",  "monster", "rear",   7,  4, 4,  7,  35],
                 ["Nekromantlar (T5)",       "ally",  "occult",  "rear",   9,  5, 2, 10,  50],
                 ["Gargoyller (T6)",         "ally",  "monster", "front", 12, 12, 3, 15,  75],
                 ["Kan Cadıları (T7)",       "ally",  "occult",  "rear",  14,  8, 3, 18,  90],
                 ["Çürük Çeneler (T8)",      "ally",  "monster", "front", 30, 90, 1, 30, 150],
                 ["Diriltilmiş Zombiler",    "enemy", "brute",   "front",  2,  1, 2],
                 ["Örümcekler",              "enemy", "monster", "rear",   1,  1, 6]]

    attacker_order = []
    for i in reversed(range(7)):
        for j in reversed(range(len(unit_desc))):
            if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "ally") & (unit_desc[j][position_index] == "rear"):
                attacker_order.append(j)
        for j in reversed(range(len(unit_desc))):
            if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "rear"):
                attacker_order.append(j)
        for j in reversed(range(len(unit_desc))):
            if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "ally") & (unit_desc[j][position_index] == "front"):
                attacker_order.append(j)
        for j in reversed(range(len(unit_desc))):
            if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "front"):
                attacker_order.append(j)

    defender_order_front = []
    for i in range(7):
        for j in range(len(unit_desc)):
            if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "front"):
                defender_order_front.append(j)
        for j in range(len(unit_desc)):
            if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "ally") & (unit_desc[j][position_index] == "front"):
                defender_order_front.append(j)

    defender_order_rear = []
    for i in range(7):
        for j in range(len(unit_desc)):
            if (unit_desc[j][speed_index] == i) & (unit_desc[j][side_index] == "enemy") & (unit_desc[j][position_index] == "rear"):
                defender_order_rear.append(j)
        for j in range(len(unit_desc)):
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

    unit_numbers_initial = [skeletons, zombies, cultists, bonewings, corpses, wraiths, revenants, giants, broodmothers, liches,
                            bats, ghouls, thralls, banshees, necromancers, gargoyles, witches, rotmaws,
                            revived, spiderlings]
    unit_numbers = list(unit_numbers_initial)

    unit_speed = [unit_desc[i][speed_index] for i in range(len(unit_desc))]
    unit_health = [unit_numbers[i] * unit_desc[i][health_index] for i in range(len(unit_numbers))]
    unit_buffs = [1] * 20

    round_count = 0
    turn_count = 0
    enemy_capable = True
    ally_capable = True

    print("--------------------------------------------------")
    print("Raund {0} — Hamle {1}".format(round_count, turn_count))
    print("- Başlangıç muharebe düzeni")
    print("")
    for i in reversed(range(len(defender_order_front_first))):
        if (unit_numbers[defender_order_front_first[i]] > 0) & (unit_desc[defender_order_front_first[i]][side_index] == "enemy"):
            print("{0:3d} {1:28s} {2:4d} can".format(unit_numbers[defender_order_front_first[i]], unit_desc[defender_order_front_first[i]][name_index], unit_health[defender_order_front_first[i]]))
    print("")
    for i in range(len(defender_order_front_first)):
        if (unit_numbers[defender_order_front_first[i]] > 0) & (unit_desc[defender_order_front_first[i]][side_index] == "ally"):
            print("{0:3d} {1:28s} {2:4d} can".format(unit_numbers[defender_order_front_first[i]], unit_desc[defender_order_front_first[i]][name_index], unit_health[defender_order_front_first[i]]))
    print("--------------------------------------------------")

    while enemy_capable & ally_capable:
        round_count += 1
        turn_count = 0
        enemy_capable = False
        ally_capable = False

        for j in range(len(unit_numbers)):
            if (unit_numbers[j] > 0) & (unit_desc[j][side_index] == "enemy"):
                enemy_capable = True
                break
        if not enemy_capable:
            print(">> Düşman yenildi! Zafer müttefiklerin.")
            break

        for j in range(len(unit_numbers)):
            if (unit_numbers[j] > 0) & (unit_desc[j][side_index] == "ally"):
                ally_capable = True
                break
        if not ally_capable:
            print(">> Müttefikler yenildi! Savaş meydanı düşmanın.")
            break

        banshees_reduce_round = -1
        banshees_reduce_target = -1
        gargoyles_reduce_event = False
        gargoyles_reduce_enemy_index = -1

        if unit_numbers[gargoyles_index] > 0:
            for k in range(0, 100):
                random_index = random.randrange(0, len(unit_numbers))
                if (unit_numbers[random_index] > 0) & (unit_desc[random_index][side_index] == "enemy"):
                    unit_speed[random_index] -= 2
                    gargoyles_reduce_enemy_index = random_index
                    gargoyles_reduce_event = True
                    break

            attacker_order = []
            for k in reversed(range(-15, 7)):
                for l in reversed(range(len(unit_speed))):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "ally") & (unit_desc[l][position_index] == "rear"):
                        attacker_order.append(l)
                for l in reversed(range(len(unit_speed))):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "enemy") & (unit_desc[l][position_index] == "rear"):
                        attacker_order.append(l)
                for l in reversed(range(len(unit_speed))):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "ally") & (unit_desc[l][position_index] == "front"):
                        attacker_order.append(l)
                for l in reversed(range(len(unit_speed))):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "enemy") & (unit_desc[l][position_index] == "front"):
                        attacker_order.append(l)

            defender_order_front = []
            for k in range(-15, 7):
                for l in range(len(unit_speed)):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "enemy") & (unit_desc[l][position_index] == "front"):
                        defender_order_front.append(l)
                for l in range(len(unit_speed)):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "ally") & (unit_desc[l][position_index] == "front"):
                        defender_order_front.append(l)

            defender_order_rear = []
            for k in range(-15, 7):
                for l in range(len(unit_speed)):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "enemy") & (unit_desc[l][position_index] == "rear"):
                        defender_order_rear.append(l)
                for l in range(len(unit_speed)):
                    if (unit_speed[l] == k) & (unit_desc[l][side_index] == "ally") & (unit_desc[l][position_index] == "rear"):
                        defender_order_rear.append(l)

            defender_order_front_first = []
            defender_order_rear_first = []
            for k in range(len(defender_order_front)):
                defender_order_front_first.append(defender_order_front[k])
            for k in range(len(defender_order_rear)):
                defender_order_front_first.append(defender_order_rear[k])
                defender_order_rear_first.append(defender_order_rear[k])
            for k in range(len(defender_order_front)):
                defender_order_rear_first.append(defender_order_front[k])

        for j in range(len(attacker_order)):
            attacker_index = -1
            defender_index = -1
            found_attacker = False
            found_defender = False

            if unit_numbers[attacker_order[j]] > 0:
                attacker_index = attacker_order[j]
                found_attacker = True

            if found_attacker:
                attacker_side = unit_desc[attacker_index][side_index]
                defender_side = "enemy" if attacker_side == "ally" else "ally"
                defender_order = defender_order_front_first
                if attacker_index == bonewings_index:
                    defender_order = defender_order_rear_first
                if attacker_index == banshees_index:
                    defender_order = defender_order_rear_first

                for l in range(len(defender_order)):
                    if (unit_numbers[defender_order[l]] > 0) & (unit_desc[defender_order[l]][side_index] == defender_side):
                        defender_index = defender_order[l]
                        found_defender = True
                        break

            if found_defender:
                turn_count += 1
                print("Raund {0} — Hamle {1}".format(round_count, turn_count))

                damage_multiplier = 1.00
                attacker_type = unit_desc[attacker_index][type_index]
                defender_type = unit_desc[defender_index][type_index]

                if unit_numbers[revenants_index] > 0:
                    if (unit_desc[attacker_index][side_index] == "ally") & (unit_desc[attacker_index][position_index] == "rear"):
                        print("- {0}, {1} hasarını %15 azaltıyor".format(unit_desc[revenants_index][name_index], unit_desc[attacker_index][name_index]))

                if gargoyles_reduce_event:
                    print("- {0}, {1} hızını 2 azalttı; {2} hızı artık {3}".format(unit_desc[gargoyles_index][name_index], unit_desc[gargoyles_reduce_enemy_index][name_index], unit_desc[gargoyles_reduce_enemy_index][name_index], unit_speed[gargoyles_reduce_enemy_index]))
                    gargoyles_reduce_event = False

                if (attacker_index == bonewings_index) & (unit_desc[defender_index][side_index] == "ally") & (unit_desc[defender_index][position_index] == "rear"):
                    print("- {0}, müttefik ön safları aşıp arka safları hedef aldı".format(unit_desc[bonewings_index][name_index]))

                if (attacker_index == banshees_index) & (unit_desc[defender_index][side_index] == "enemy") & (unit_desc[defender_index][position_index] == "rear"):
                    print("- {0}, düşman ön safları aşıp arka safları hedef aldı".format(unit_desc[banshees_index][name_index]))

                if (attacker_type == "brute") & (defender_type == "occult"):
                    damage_multiplier = 1.50
                    print("- {0}, {1} karşısında tip üstünlüğüne sahip (+%50 hasar)".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))
                if (attacker_type == "brute") & (defender_type == "monster"):
                    damage_multiplier = 0.50
                    print("- {0}, {1} karşısında tip dezavantajlı (-%50 hasar)".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))
                if (attacker_type == "occult") & (defender_type == "brute") & (defender_index != ghouls_index) & (attacker_index != wraiths_index):
                    damage_multiplier = 0.50
                    print("- {0}, {1} karşısında tip dezavantajlı (-%50 hasar)".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))
                if (attacker_type == "occult") & (defender_type == "monster") & (attacker_index != wraiths_index):
                    damage_multiplier = 1.50
                    print("- {0}, {1} karşısında tip üstünlüğüne sahip (+%50 hasar)".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))
                if (attacker_type == "monster") & (defender_type == "brute") & (defender_index != ghouls_index) & (attacker_index != rotmaws_index):
                    damage_multiplier = 1.50
                    print("- {0}, {1} karşısında tip üstünlüğüne sahip (+%50 hasar)".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))
                if (attacker_type == "monster") & (defender_type == "occult") & (attacker_index != rotmaws_index):
                    damage_multiplier = 0.50
                    print("- {0}, {1} karşısında tip dezavantajlı (-%50 hasar)".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index]))

                if attacker_index == wraiths_index:
                    damage_multiplier = 1.00
                    print("- {0}, birim tipini önemsemiyor".format(unit_desc[wraiths_index][name_index]))
                if defender_index == ghouls_index:
                    damage_multiplier = 0.50
                    print("- {0}, {1} üzerine -%50 azalmış hasarla saldırıyor".format(unit_desc[attacker_index][name_index], unit_desc[ghouls_index][name_index]))
                if attacker_index == rotmaws_index:
                    damage_multiplier = 1.00
                    print("- {0}, birim tipini önemsemiyor".format(unit_desc[rotmaws_index][name_index]))

                unit_numbers_before = list(unit_numbers)

                if (attacker_index == bonewings_index) & (turn_count == 1):
                    damage_multiplier *= 1.20
                    print("- {0}, turun ilki olduğu için +%20 hasar kazandı".format(unit_desc[attacker_index][name_index]))

                if attacker_index == wraiths_index:
                    wraiths_damage_multiplier = 1.00
                    ally_unit_numbers = unit_numbers[defender_index]
                    while ally_unit_numbers >= 2 * unit_numbers[wraiths_index]:
                        wraiths_damage_multiplier += 0.50
                        ally_unit_numbers -= unit_numbers[wraiths_index]
                    damage_multiplier *= wraiths_damage_multiplier
                    print("- {0}, {1:.2f}x hasar çarpanı kazandı".format(unit_desc[wraiths_index][name_index], wraiths_damage_multiplier))

                if unit_numbers[revenants_index] > 0:
                    if (unit_desc[attacker_index][side_index] == "ally") & (unit_desc[attacker_index][position_index] == "rear"):
                        damage_multiplier *= 0.85

                if (attacker_index == bats_index) & (round_count == 1):
                    damage_multiplier *= 1.25
                    print("- {0}, ilk turda +%25 hasarla saldırıyor".format(unit_desc[bats_index][name_index]))

                if (attacker_index == thralls_index) & (unit_speed[defender_index] < 3):
                    damage_multiplier *= 1.33
                    print("- {0}, yavaş düşmana +%33 hasarla saldırıyor".format(unit_desc[thralls_index][name_index]))

                if attacker_index == banshees_index:
                    banshees_reduce_round = round_count
                    banshees_reduce_target = defender_index
                    print("- {0}, {1} hasarını %25 azalttı".format(unit_desc[banshees_index][name_index], unit_desc[banshees_reduce_target][name_index]))
                if (banshees_reduce_round == round_count) & (attacker_index == banshees_reduce_target):
                    damage_multiplier *= 0.75
                    print("- {0}, -%25 azalmış hasarla saldırıyor".format(unit_desc[attacker_index][name_index]))

                if attacker_index == necromancers_index:
                    necromancers_multiply_percent = int(unit_buffs[necromancers_index] * 100)
                    print("- {0}, +%{1} hasarla saldırıyor".format(unit_desc[necromancers_index][name_index], necromancers_multiply_percent))

                if attacker_index == giants_index:
                    giants_multiply_percent = int(unit_buffs[giants_index] * 100)
                    print("- {0}, +%{1} hasarla saldırıyor".format(unit_desc[giants_index][name_index], giants_multiply_percent))

                liches_splash_damage = 0
                witches_splash_damage = 0
                rotmaws_overkill_damage = 0

                attacker_damage = round(unit_numbers[attacker_index] * unit_desc[attacker_index][attack_index] * damage_multiplier * unit_buffs[attacker_index] + 0.001)
                unit_health[defender_index] -= attacker_damage
                print("- {0}, {1} üzerine {2} hasar vurdu".format(unit_desc[attacker_index][name_index], unit_desc[defender_index][name_index], attacker_damage))

                if (attacker_index == witches_index) & (unit_numbers[witches_index] > 0) & ((round_count % 2) == 0):
                    witches_splash_damage = round(attacker_damage * 0.25 + 0.001)

                if unit_health[defender_index] <= 0:
                    if attacker_index == liches_index:
                        liches_splash_damage = round(attacker_damage * 0.50 + 0.001)
                    if attacker_index == rotmaws_index:
                        rotmaws_overkill_damage = unit_health[defender_index] * (-1)
                    unit_health[defender_index] = 0
                    print("- {0} tamamen yok edildi".format(unit_desc[defender_index][name_index]))

                unit_numbers[defender_index] = math.ceil(unit_health[defender_index] / unit_desc[defender_index][health_index])

                if liches_splash_damage > 0:
                    for n in range(len(defender_order)):
                        if (unit_numbers[defender_order[n]] > 0) & (unit_desc[defender_order[n]][side_index] == "ally") & (unit_desc[defender_order[n]][position_index] == "rear"):
                            unit_health[defender_order[n]] -= liches_splash_damage
                            print("- {0}, {1} üzerine {2} yayılma hasarı verdi".format(unit_desc[liches_index][name_index], unit_desc[defender_order[n]][name_index], liches_splash_damage))
                            if unit_health[defender_order[n]] <= 0:
                                unit_health[defender_order[n]] = 0
                                print("- {0} tamamen yok edildi".format(unit_desc[defender_order[n]][name_index]))
                            unit_numbers[defender_order[n]] = math.ceil(float(unit_health[defender_order[n]]) / float(unit_desc[defender_order[n]][health_index]))
                            break

                if witches_splash_damage > 0:
                    for m in range(len(unit_desc)):
                        if (unit_desc[m][side_index] == "enemy") & (unit_desc[m][position_index] == "rear"):
                            unit_was_alive = False
                            if unit_health[m] > 0:
                                unit_was_alive = True
                                print("- {0}, {1} üzerine {2} yayılma hasarı verdi".format(unit_desc[witches_index][name_index], unit_desc[m][name_index], witches_splash_damage))
                            unit_health[m] -= witches_splash_damage
                            if unit_health[m] < 0:
                                unit_health[m] = 0
                                if (unit_health[m] == 0) & unit_was_alive:
                                    print("- {0} tamamen yok edildi".format(unit_desc[m][name_index]))
                            unit_numbers[m] = math.ceil(unit_health[m] / unit_desc[m][health_index])

                if rotmaws_overkill_damage > 0:
                    for n in range(len(unit_numbers)):
                        if (unit_numbers[n] > 0) & (unit_desc[n][side_index] == "enemy"):
                            unit_health[n] -= rotmaws_overkill_damage
                            print("- {0}, {1} üzerine {2} artık (overkill) hasar verdi".format(unit_desc[rotmaws_index][name_index], unit_desc[n][name_index], rotmaws_overkill_damage))
                            if unit_health[n] <= 0:
                                unit_health[n] = 0
                                print("- {0} tamamen yok edildi".format(unit_desc[n][name_index]))
                            unit_numbers[n] = math.ceil(unit_health[n] / unit_desc[n][health_index])
                            break

                zombies_numbers_diff = unit_numbers_before[zombies_index] - unit_numbers[zombies_index]
                if (zombies_numbers_diff > 0) & (unit_numbers[zombies_index] == 0):
                    unit_numbers[revived_index] = zombies
                    unit_health[revived_index] = zombies * unit_desc[revived_index][health_index]
                    print("- {0}, her biri 1 canla geri dirildi".format(unit_desc[zombies_index][name_index]))

                if (attacker_index == cultists_index) & (unit_numbers[cultists_index] > 0):
                    for n in range(50):
                        random_unit_index = random.randrange(0, len(unit_numbers))
                        if (random_unit_index != cultists_index) & (unit_numbers[random_unit_index] > 0) & (unit_desc[random_unit_index][side_index] == "enemy"):
                            unit_buffs[random_unit_index] += 0.10
                            print("- {0}, {1} birimini +%10 hasar artışıyla güçlendirdi".format(unit_desc[cultists_index][name_index], unit_desc[random_unit_index][name_index]))
                            break

                corpses_numbers_diff = unit_numbers_before[corpses_index] - unit_numbers[corpses_index]
                if (corpses_numbers_diff > 0) & (unit_numbers[corpses_index] == 0):
                    corpses_damage = math.ceil(corpses * unit_desc[corpses_index][health_index] * 0.20)
                    unit_health[attacker_index] -= corpses_damage
                    print("- {0}, {1} karşısında {2} intikam hasarı verdi".format(unit_desc[corpses_index][name_index], unit_desc[attacker_index][name_index], corpses_damage))
                    if unit_health[attacker_index] <= 0:
                        unit_health[attacker_index] = 0
                        print("- {0} tamamen yok edildi".format(unit_desc[attacker_index][name_index]))
                    unit_numbers[attacker_index] = math.ceil(unit_health[attacker_index] / unit_desc[attacker_index][health_index])

                if (defender_index == giants_index) & (unit_numbers[giants_index] > 0):
                    unit_buffs[giants_index] += 0.05
                    print("- {0}, +%5 hasar biriktirdi".format(unit_desc[giants_index][name_index]))

                if attacker_index == giants_index:
                    unit_buffs[giants_index] = 1
                    print("- Kemik Devlerin biriktirdiği hasar sıfırlandı")

                if unit_numbers[necromancers_index] > 0:
                    for m in range(len(unit_numbers)):
                        if ((unit_numbers_before[m] - unit_numbers[m]) > 0) & (unit_numbers[m] == 0):
                            unit_buffs[necromancers_index] += 0.10
                            print("- {0}, yok edilen {1} sayesinde +%10 hasar kazandı".format(unit_desc[necromancers_index][name_index], unit_desc[m][name_index]))

                detected_next_attacker_unit = False
                for l in range(j + 1, len(unit_numbers) - 1):
                    if unit_numbers[attacker_order[l]] > 0:
                        detected_next_attacker_unit = True

                if (not detected_next_attacker_unit) & (unit_numbers[broodmothers_index] > 0):
                    unit_numbers[spiderlings_index] += 10
                    unit_health[spiderlings_index] += 10 * unit_desc[spiderlings_index][health_index]
                    print("- {0}, 10 yeni {1} doğurdu".format(unit_desc[broodmothers_index][name_index], unit_desc[spiderlings_index][name_index]))

                print("")
                for l in reversed(range(len(defender_order_front_first))):
                    if (unit_numbers[defender_order_front_first[l]] > 0) & (unit_desc[defender_order_front_first[l]][side_index] == "enemy"):
                        print("{0:3d} {1:28s} {2:4d} can".format(unit_numbers[defender_order_front_first[l]], unit_desc[defender_order_front_first[l]][name_index], unit_health[defender_order_front_first[l]]))
                print("")
                for l in range(len(defender_order_front_first)):
                    if (unit_numbers[defender_order_front_first[l]] > 0) & (unit_desc[defender_order_front_first[l]][side_index] == "ally"):
                        print("{0:3d} {1:28s} {2:4d} can".format(unit_numbers[defender_order_front_first[l]], unit_desc[defender_order_front_first[l]][name_index], unit_health[defender_order_front_first[l]]))
                print("--------------------------------------------------")

    print("--------------------------------------------------")
    print("Kayıp Birlikler")
    lost_units_total = 0
    lost_blood_total = 0
    for i in range(bats_index, revived_index):
        lost_units = unit_numbers_initial[i] - unit_numbers[i]
        if lost_units > 0:
            lost_units_total += lost_units
            lost_blood = lost_units * unit_desc[i][blood_index]
            lost_blood_total += lost_blood
            print("- {0:3d} {1:28s} ({2:4d} kan)".format(lost_units, unit_desc[i][name_index], lost_blood))
    print("")
    print("= {0:3d} toplam {1:21s} ({2:4d} kan)".format(lost_units_total, "", lost_blood_total))
    print("--------------------------------------------------")
    capacity = 0
    for i in range(bats_index, revived_index):
        capacity += unit_numbers_initial[i] * unit_desc[i][space_index]
    print("Toplam birlik kapasitesi: {0}".format(capacity))


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------
# Color palette — dark Catppuccin-esque with red/purple accents
BG_MAIN      = "#1a1b26"
BG_PANEL     = "#24283b"
BG_CARD      = "#2e334a"
BG_INPUT     = "#1f2335"
BG_OUTPUT    = "#16161e"
FG_PRIMARY   = "#c0caf5"
FG_MUTED     = "#7982a9"
FG_TITLE     = "#e0e6ff"
ACCENT_ENEMY = "#f7768e"
ACCENT_ALLY  = "#bb9af7"
ACCENT_BTN   = "#7aa2f7"
ACCENT_BTN_HOVER = "#9ab8ff"
BORDER       = "#414868"

ENEMY_UNITS = [
    ("skeletons",    "İskelet (T1)",          0),
    ("zombies",      "Zombi (T2)",            0),
    ("cultists",     "Tarikatçı (T3)",        0),
    ("bonewings",    "Kemik Kanat (T4)",      0),
    ("corpses",      "Şişmiş Ceset (T5)",     0),
    ("wraiths",      "Hayalet (T6)",          0),
    ("revenants",    "Hortlak (T7)",          0),
    ("giants",       "Kemik Dev (T8)",        0),
    ("broodmothers", "Yavrulayan Ana (T9)",   0),
    ("liches",       "Lich (T10)",            0),
]

ALLY_UNITS = [
    ("bats",         "Yarasa (T1)",           0),
    ("ghouls",       "Gulyabani (T2)",        0),
    ("thralls",      "Vampir Köle (T3)",      0),
    ("banshees",     "Banşi (T4)",            0),
    ("necromancers", "Nekromant (T5)",        0),
    ("gargoyles",    "Gargoyl (T6)",          0),
    ("witches",      "Kan Cadısı (T7)",       0),
    ("rotmaws",      "Çürük Çene (T8)",       0),
]


class BattleApp:
    def __init__(self, root):
        self.root = root
        self.root.title("BT Analyss — Savaş Simülatörü")
        self.root.geometry("1280x720")
        self.root.configure(bg=BG_MAIN)
        self.root.minsize(1050, 640)

        self.inputs = {}

        self._setup_fonts()
        self._build_header()
        self._build_body()
        self._build_footer()

    def _setup_fonts(self):
        self.font_title    = font.Font(family="Segoe UI", size=18, weight="bold")
        self.font_subtitle = font.Font(family="Segoe UI", size=9)
        self.font_section  = font.Font(family="Segoe UI", size=11, weight="bold")
        self.font_label    = font.Font(family="Segoe UI", size=9)
        self.font_button   = font.Font(family="Segoe UI", size=10, weight="bold")
        self.font_mono     = font.Font(family="Cascadia Mono", size=9)

    def _build_header(self):
        header = tk.Frame(self.root, bg=BG_MAIN, height=50)
        header.pack(fill="x", padx=20, pady=(12, 0))
        header.pack_propagate(False)

        title = tk.Label(header, text="⚔  SAVAŞ  SİMÜLATÖRÜ",
                         font=self.font_title, fg=FG_TITLE, bg=BG_MAIN)
        title.pack(side="left", anchor="w")

        subtitle = tk.Label(header,
                            text="Ölümsüzler vs Vampirler — taktiksel muharebe analizcisi",
                            font=self.font_subtitle, fg=FG_MUTED, bg=BG_MAIN)
        subtitle.pack(side="left", anchor="sw", padx=(14, 0), pady=(0, 6))

    def _build_body(self):
        body = tk.Frame(self.root, bg=BG_MAIN)
        body.pack(fill="both", expand=True, padx=20, pady=10)

        # Left: inputs (fixed width so cards can't shrink below their content)
        left = tk.Frame(body, bg=BG_MAIN, width=440)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        self._build_unit_card(left, "DÜŞMAN  KUVVETLERİ", ENEMY_UNITS, ACCENT_ENEMY)
        self._build_unit_card(left, "MÜTTEFİK  KUVVETLERİ", ALLY_UNITS, ACCENT_ALLY, top_pad=10)

        # Right: output
        right = tk.Frame(body, bg=BG_MAIN)
        right.pack(side="left", fill="both", expand=True, padx=(20, 0))

        out_card = tk.Frame(right, bg=BG_PANEL, highlightthickness=1,
                            highlightbackground=BORDER)
        out_card.pack(fill="both", expand=True)

        head = tk.Frame(out_card, bg=BG_PANEL)
        head.pack(fill="x", padx=14, pady=(10, 4))
        tk.Label(head, text="SAVAŞ  GÜNLÜĞÜ", font=self.font_section,
                 fg=FG_TITLE, bg=BG_PANEL).pack(side="left")
        self.status_label = tk.Label(head, text="hazır", font=self.font_subtitle,
                                     fg=FG_MUTED, bg=BG_PANEL)
        self.status_label.pack(side="right")

        text_frame = tk.Frame(out_card, bg=BG_OUTPUT)
        text_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self.output = tk.Text(text_frame, bg=BG_OUTPUT, fg=FG_PRIMARY,
                              font=self.font_mono, wrap="none", bd=0,
                              insertbackground=FG_PRIMARY, padx=14, pady=12,
                              selectbackground=ACCENT_BTN)
        yscroll = ttk.Scrollbar(text_frame, orient="vertical", command=self.output.yview)
        self.output.configure(yscrollcommand=yscroll.set)
        self.output.pack(side="left", fill="both", expand=True)
        yscroll.pack(side="right", fill="y")

        style = ttk.Style()
        style.theme_use("default")
        style.configure("Vertical.TScrollbar", background=BG_CARD,
                        troughcolor=BG_OUTPUT, bordercolor=BG_OUTPUT,
                        arrowcolor=FG_MUTED, relief="flat")

        self.output.tag_configure("sep",     foreground=BORDER)
        self.output.tag_configure("round",   foreground=ACCENT_BTN)
        self.output.tag_configure("enemy",   foreground=ACCENT_ENEMY)
        self.output.tag_configure("ally",    foreground=ACCENT_ALLY)
        self.output.tag_configure("event",   foreground="#e0af68")
        self.output.tag_configure("destroy", foreground="#f7768e", underline=False)
        self.output.tag_configure("win",     foreground="#9ece6a", font=("Cascadia Mono", 10, "bold"))
        self.output.tag_configure("header",  foreground="#7dcfff", font=("Cascadia Mono", 11, "bold"))
        self.output.tag_configure("subhead", foreground=FG_MUTED, font=("Cascadia Mono", 9, "italic"))

        self._write_placeholder()

    def _build_unit_card(self, parent, title, units, accent, top_pad=0):
        card = tk.Frame(parent, bg=BG_PANEL, highlightthickness=1,
                        highlightbackground=BORDER)
        card.pack(fill="x", pady=(top_pad, 0))

        head = tk.Frame(card, bg=BG_PANEL)
        head.pack(fill="x", padx=14, pady=(10, 4))

        bar = tk.Frame(head, bg=accent, width=3, height=16)
        bar.pack(side="left", padx=(0, 8))
        tk.Label(head, text=title, font=self.font_section,
                 fg=FG_TITLE, bg=BG_PANEL).pack(side="left")

        grid = tk.Frame(card, bg=BG_PANEL)
        grid.pack(fill="x", padx=14, pady=(2, 10))

        for idx, (key, label, default) in enumerate(units):
            row, col = divmod(idx, 2)
            cell = tk.Frame(grid, bg=BG_PANEL)
            cell.grid(row=row, column=col, sticky="ew",
                      padx=(0 if col == 0 else 8, 0), pady=2)
            grid.grid_columnconfigure(col, weight=1, uniform="u")

            tk.Label(cell, text=label, font=self.font_label, fg=FG_MUTED,
                     bg=BG_PANEL, anchor="w", width=11).pack(side="left")

            wrap = tk.Frame(cell, bg=BG_INPUT, highlightthickness=1,
                            highlightbackground=BORDER)
            wrap.pack(side="left", fill="x", expand=True)

            var = tk.StringVar(value=str(default))
            entry = tk.Entry(wrap, textvariable=var, bg=BG_INPUT, fg=FG_PRIMARY,
                             bd=0, insertbackground=accent, font=self.font_label,
                             relief="flat", justify="center")
            entry.pack(fill="x", padx=8, pady=4)
            entry.bind("<FocusIn>",
                       lambda e, w=wrap, a=accent: w.configure(highlightbackground=a))
            entry.bind("<FocusOut>",
                       lambda e, w=wrap: w.configure(highlightbackground=BORDER))

            self.inputs[key] = var

    def _build_footer(self):
        footer = tk.Frame(self.root, bg=BG_MAIN)
        footer.pack(fill="x", padx=20, pady=(0, 12))

        self.sim_btn = tk.Label(footer, text="▶   SAVAŞI  BAŞLAT",
                                font=self.font_button, fg="#0b0d17",
                                bg=ACCENT_BTN, padx=22, pady=8, cursor="hand2")
        self.sim_btn.pack(side="right")
        self.sim_btn.bind("<Button-1>", lambda e: self.run_simulation())
        self.sim_btn.bind("<Enter>",
                          lambda e: self.sim_btn.configure(bg=ACCENT_BTN_HOVER))
        self.sim_btn.bind("<Leave>",
                          lambda e: self.sim_btn.configure(bg=ACCENT_BTN))

        self.reset_btn = tk.Label(footer, text="↺  Tümünü Sıfırla",
                                  font=self.font_button, fg=FG_PRIMARY,
                                  bg=BG_CARD, padx=16, pady=8, cursor="hand2")
        self.reset_btn.pack(side="right", padx=(0, 8))
        self.reset_btn.bind("<Button-1>", lambda e: self.reset_inputs())
        self.reset_btn.bind("<Enter>",
                            lambda e: self.reset_btn.configure(bg=BORDER))
        self.reset_btn.bind("<Leave>",
                            lambda e: self.reset_btn.configure(bg=BG_CARD))

        tk.Label(footer, text="ipucu: soldaki sayıları girin, sonra “Savaşı Başlat”a basın — “Tümünü Sıfırla” tüm kutuları 0'a çeker",
                 font=self.font_subtitle, fg=FG_MUTED, bg=BG_MAIN).pack(side="left", pady=8)

    def _write_placeholder(self):
        self.output.configure(state="normal")
        self.output.delete("1.0", "end")
        msg = (
            "                    ╔══════════════════════════════════╗\n"
            "                    ║     SAVAŞA  HAZIR                ║\n"
            "                    ╚══════════════════════════════════╝\n\n"
            "        Sol panelden düşman ve müttefik birlik sayılarını girin,\n"
            "        ardından  ▶  SAVAŞI  BAŞLAT  tuşuna basın.\n"
        )
        self.output.insert("end", msg, "sep")
        self.output.configure(state="disabled")

    def _collect_inputs(self):
        enemy = {}
        ally = {}
        for key, _, _ in ENEMY_UNITS:
            enemy[key] = self._parse_int(self.inputs[key].get(), key)
        for key, _, _ in ALLY_UNITS:
            ally[key] = self._parse_int(self.inputs[key].get(), key)
        return enemy, ally

    def _parse_int(self, value, key):
        value = value.strip()
        if value == "":
            return 0
        try:
            n = int(value)
            if n < 0:
                raise ValueError
            return n
        except ValueError:
            raise ValueError(f"'{key}' için geçersiz değer: {value!r} (sıfır veya pozitif tam sayı olmalı)")

    def reset_inputs(self):
        for key, _, _ in ENEMY_UNITS + ALLY_UNITS:
            self.inputs[key].set("0")
        self._write_placeholder()
        self.status_label.configure(text="sıfırlandı")

    def run_simulation(self):
        try:
            enemy, ally = self._collect_inputs()
        except ValueError as e:
            messagebox.showerror("Geçersiz giriş", str(e))
            return

        self.status_label.configure(text="simülasyon çalışıyor...")
        self.root.update_idletasks()

        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                simulate_battle(enemy, ally)
        except Exception as e:
            messagebox.showerror("Simülasyon hatası", str(e))
            self.status_label.configure(text="hata")
            return

        text = buf.getvalue()
        self._render_output(text)
        self.status_label.configure(text="tamamlandı")

    def _render_output(self, text):
        self.output.configure(state="normal")
        self.output.delete("1.0", "end")

        lines = text.splitlines()

        # Split the captured log into (details, summary) around the victory line
        victory_idx = -1
        for i, line in enumerate(lines):
            if line.strip().startswith(">>"):
                victory_idx = i
                break

        if victory_idx >= 0:
            split_at = victory_idx
            if split_at > 0 and lines[split_at - 1].strip().startswith("---"):
                split_at -= 1
            summary_lines = lines[split_at:]
            details_lines = lines[:split_at]
        else:
            summary_lines = []
            details_lines = lines

        # 1) Summary block at the top
        self.output.insert("end",
            "══════════════════════  SAVAŞ  SONUCU  ══════════════════════\n",
            "header")
        if summary_lines:
            self._render_lines(summary_lines)
        else:
            self.output.insert("end", "  (sonuç henüz belirlenmedi)\n", "subhead")

        self.output.insert("end", "\n\n", ())

        # 2) Detailed turn-by-turn breakdown below
        self.output.insert("end",
            "══════════════════════  TUR  TUR  ANALİZ  ══════════════════════\n",
            "header")
        self.output.insert("end",
            "  her raundun olayları ve muharebe düzeni aşağıdadır\n\n",
            "subhead")
        self._render_lines(details_lines)

        self.output.configure(state="disabled")
        self.output.see("1.0")

    def _render_lines(self, lines):
        for line in lines:
            tag = self._classify_line(line)
            self.output.insert("end", line + "\n", tag or ())

    def _classify_line(self, line):
        stripped = line.strip()
        if stripped.startswith("---"):
            return "sep"
        if stripped.startswith(">>"):
            return "win"
        if stripped.startswith("Raund"):
            return "round"
        if stripped.startswith("Kayıp Birlikler") or stripped.startswith("Toplam birlik kapasitesi"):
            return "header"
        if "yok edildi" in stripped:
            return "destroy"
        if stripped.startswith("-") or stripped.startswith("="):
            return "event"
        if " can" in stripped:
            return "ally" if self._is_ally_line(stripped) else "enemy"
        return None

    def _is_ally_line(self, line):
        ally_names = ("Yarasalar", "Gulyabaniler", "Vampir Köleler", "Banşiler",
                      "Nekromantlar", "Gargoyller", "Kan Cadıları", "Çürük Çeneler")
        return any(name in line for name in ally_names)


def main():
    root = tk.Tk()
    try:
        root.tk.call("tk", "scaling", 1.2)
    except tk.TclError:
        pass
    BattleApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
