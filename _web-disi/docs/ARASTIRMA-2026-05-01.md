# Savaş Motoru Patch Araştırması — 2026-05-01

## Amaç
Yeni yanlış raporlar (Yanlis Sonuclar.txt, 11 rapor) ile mevcut motoru karşılaştırıp,
doğruları bozmadan yanlışları düzelten bir patch bulmak.

---

## ADIM 1 — Mevcut Durum Tespiti

### Mevcut battle-core.js Patch'leri (DEBUG_NOTES_2026-05-01.md'den):
1. **Witch splash only on kill** — Cadı splash hasarı sadece defender tamamen yok edilirse tetikleniyor.
2. **Broodmother spawn only if alive** — Raund sonunda `unitNumbers[BROODMOTHERS_INDEX] > 0` kontrolü var.

Her ikisi de şu an kodda mevcut (satır 646-649 ve 795-802).

### Mevcut "detectedNextAttackerUnit" Bug:
```js
for (let l = j + 1; l < unitNumbers.length - 1; l += 1) {
```
`unitNumbers.length - 1 = 19` → attackerOrder'ın son elemanı (index 19) HİÇBİR ZAMAN kontrol edilmiyor.
Bu, sonda bir attacker varsa broodmother fazladan spawn yapabilir. Sonuç: belirsiz.

---

## ADIM 2 — Yanlış Raporların Analizi

Toplam 11 rapor, tarih aralığı 2026-04-29 → 2026-05-01.

### Tablo: Her Raporun Özeti

| # | Düşman T9 | Temel Sapma | Yön |
|---|----------|-------------|-----|
| R1 | T9=4 | T6: 6 beklendi, 1 gerçek | Fazla tahmin |
| R2 | T9=5 | T3: 32 beklendi, 40 gerçek | Az tahmin |
| R3 | T9=5 | T3: 0 beklendi, 3 gerçek; T4: 3 beklendi, 1 gerçek | Karışık |
| R4 | T9=4 | T1: 15→24, T3: 0→22, T6: 0→4 | Büyük az tahmin |
| R5 | T9=7 | T6: 0→3, T7: 0→6 | Gargoyl+Cadı eksik |
| R6 | T9=6 | T4: 0→8, T6: 0→6 | Bansi+Gargoyl eksik |
| R7 | T9=7 | T6: 0→3 | Gargoyl eksik |
| R8 | T9=7 | T7: 0→2 | Cadı eksik |
| R9 | T9=6 | T1: 18→31, T6: 0→4 | Bat+Gargoyl eksik |
| R10| T9=0 | T6: 0→2 | Gargoyl eksik (eski vaka) |
| R11| T9=0 | T6: 0→1 | Gargoyl eksik (eski vaka) |

### Kritik Gözlem:
- **R1-R9: Hepsinde T9 (Broodmothers) mevcut** → spiderling spawn ilgili olabilir
- **R10-R11: T9 YOK** → eski gargoyl sorusu, muhtemelen seed varyansı
- **Baskın pattern: T6 (Gargoyl) kayıpları gerçekte daha fazla**

---

## ADIM 3 — Broodmother / Spiderling Mekanik Analizi

### Mevcut Kod Mantığı:
1. Her raund sonunda LAST ATTACKER saldırısından sonra 10 spiderling spawn olur
2. Spiderlings speed=6, attack=1, HP=1, pozisyon="rear", tip="monster"
3. Bir sonraki raundda attacker order'a girerler (speed 6 ile erken)
4. Ally FRONT birimlerini hedef alırlar (front-first order)
5. Gargoyllar FRONT pozisyonda → spiderlings gargoyllara saldırır

### Sorun: Neden simulator yanlış?
Spiderlings spawn oluyor ve gargoyllara saldırıyor. Peki neden simulator gargoyl kaybını görmüyor?

**Hipotez A:** Spiderlings doğru spawn olmuyor (detectedNextAttackerUnit bug)
**Hipotez B:** Spiderlings gargoyllara yeterince hasar veremiyor (seed varyansı — bazı seed'lerde savaş daha erken bitiyor)
**Hipotez C:** Spawn sayısı yanlış — gerçekte 10 × broodmotherCount spiderling spawns

DEBUG_NOTES_2026-04-30.md'den kural:
> "Broodmother: kaç tane Broodmother kalırsa kalsın 10 Spiderling üretir"

Yani spawn sayısı sabit 10 → Hipotez C eleniyor.

---

## ADIM 4 — Test Scripti Yazıldı

`test-yanlis-2026-05-01.js` oluşturuldu. Bu script:
- 11 yanlış raporu yükler
- Her biri için 512 seed dener (0-511)
- Herhangi bir seed exact match verirse → "DÜZELDİ"
- Kan kaybı farkını da hesaplar

(sonuçlar aşağıda eklenecek)

---

## ADIM 5 — Baseline Test Sonuçları (mevcut motor, 512 seed)

| Rapor | T9 | Durum | Diff | Açıklama |
|-------|----|-------|------|----------|
| R1 | 4 | ⬜ AYNI | 5 | T6=6 tahmin, 1 gerçek (fazla tahmin) |
| R2 | 5 | 🔶 İYİLEŞTİ | 5→5 (8→5) | T3 thrall yaklaştı |
| R3 | 5 | ⬜ AYNI | 5 | T3/T4 karışık |
| R4 | 4 | 🔶 İYİLEŞTİ | 35→2 | Büyük düzelme (patch etkisi) |
| R5 | 7 | 🔶 İYİLEŞTİ | 9→1 | 1 fazla Thrall tahmini kaldı |
| R6 | 6 | ⬜ AYNI | 16 | Bansi+Gargoyl hiç tahmin edilmiyor |
| R7 | 7 | ❌ KÖTÜLEŞTI | 3→6 | 6 **yanlış** Bansi kaybı eklendi |
| R8 | 7 | ⬜ AYNI | 2 | Cadı kaybı 0 tahmin |
| R9 | 6 | 🔶 İYİLEŞTİ | 17→14 | Gargoyl biraz yaklaştı |
| R10 | 0 | ⬜ AYNI | 2 | 2 Gargoyl kaybı tahmin edilmiyor |
| R11 | 0 | ⬜ AYNI | 1 | 1 Gargoyl kaybı tahmin edilmiyor |

**Onaylı korunan: 94/94 ✅**

---

## ADIM 6 — Python Referans Kodu Karşılaştırması (simulate_vampire_v5.1.py)

Python dosyası eklenince analiz yapıldı. Kritik farklar:

### FARK 1 — Witch Splash Kill Condition (ÖNEMLİ)
**Python kodu:**
```python
# Sadece even round'da, KILL şartı YOK
if (attacker_index == witches_index) & (unit_size[witches_index] > 0) & ((round_count % 2) == 0):
    witches_splash_damage = round(attacker_damage * 0.25 + 0.001)
```

**Mevcut JS kodu (patch sonrası):**
```javascript
if (unitHealth[defenderIndex] <= 0) {  // KILL şartı VAR
  if (witchesSplashEligible) {
    witchesSplashDamage = ceilCombatValue(attackerDamage * 0.25);
```

→ **Python: her even round saldırısında splash açık. JS (patch): sadece kill olunca splash.**

DEBUG_NOTES_2026-05-01: patch R4'ü 1865→2685'e getirdi. Ama **R7'yi 3→6 bozdu!**

### FARK 2 — Cultists Buff Inheritance to Revived Zombies (Python'da VAR, JS'de YOK)
```python
# copy-paste zombies buff to revived zombies buff since they are the same group
if random_unit_index == zombies_index:
    unit_buff[revived_index] = unit_buff[zombies_index]
```
JS kodunda bu inheritance yok. Cultist'ler Zombileri bufflarsa, revived zombiler aynı buff'ı almıyor.

### FARK 3 — Revived Zombie Count Calculation (Her ikisinde de /7)
```python
base_hp = unit_desc[zombies_index][health_index]  # = 7 (original zombie HP)
unit_size[defender_index] = math.ceil(unit_health[defender_index] / base_hp)
```
**Comment: "credit to S1N1STRO - correction for revived zombies attack damage"**

Her iki kodda da revived zombie sayısı HP/7 ile hesaplanıyor. Bu kasıtlı bir tasarım kararı.

### FARK 4 — Wraith Special Targeting (Python'da YOK, JS'de VAR)
JS'de olan özel Wraith→Banshee hedefleme mantığı Python'da bulunmuyor. Bu JS'e sonradan eklenmiş.

### FARK 5 — Defender Order: Per-Turn vs Per-Round
Python her saldırı öncesinde defender sırasını yeniden hesaplıyor.
JS sadece round başında ve gargoyl reactive slow sonrasında hesaplıyor.
Pratikte etkisi minimal (JS findDefenderForAttacker canlı sayıları kullanıyor).

---

## ADIM 7 — Hipotez Test Sonuçları

### YÖNTEM NOTU: CRLF Bug
`test-hipotez-2026-05-01.js` içinde `loadPatchedCore` fonksiyonu patchi `code.replace(from, to)` ile uyguluyor.
`battle-core.js` dosyası çoğunlukla CRLF satır sonu kullanıyor (2322 CRLF, 208 LF-only).
Template literal içindeki patch stringleri LF kullandığından, CRLF alanlar eşleşmiyor!
**Fix:** `code = code.replace(/\r\n/g, "\n")` satırı eklendi. Artık tüm patchler doğru uygulanıyor.

---

### HİPOTEZ A: Witch Splash REVERT (kill condition kaldırma)
**Hedef:** R7'deki yanlış kayıpları gidermek  
**Değişiklik:** Witch splash'ı kill şartından bağımsız hale getir (Python gibi)  

**Sonuç:**
| Rapor | Durum | Önceki Diff | Yeni Diff |
|-------|-------|-------------|-----------|
| R2 | 🔶 İYİLEŞTİ | 8 | 5 |
| R4 | 🔶 İYİLEŞTİ | 35 | 9 |
| R7 | ⬜ AYNI | 3 | 3 |
| R9 | 🔶 İYİLEŞTİ | 17 | 14 |
| R5 | ⬜ AYNI (kötüleşti) | 9→1 baseline'a göre | 9 (geri geldi) |

**Özet:** Düzeldi=0 İyileşti=3 Aynı=8 Kötüleşti=0 — Doğru korunan: 94/94 ✅  
**Not:** R4 için baseline (kill condition'lı) daha iyi (diff=2 vs diff=9). R5'i geri bozuyor. R7'yi düzeltmiyor.

---

### HİPOTEZ B: Cultist Buff → Revived Zombies
**Hedef:** Cultist buffının revived zombie'ye geçmesini sağla  
**Sonuç:** Baseline ile tamamen aynı. Etki görülmedi.  
**Özet:** Düzeldi=0 İyileşti=4 Aynı=6 Kötüleşti=1 — Doğru korunan: 94/94 ✅  
**Not:** Mevcut yanlış raporlarda Cultist→Revived path hiç tetiklenmiyor.

---

### HİPOTEZ C: Witch REVERT + Cultist Buff
**Sonuç:** A ile aynı (Cultist değişikliği etkisiz). 94/94 ✅

---

### HİPOTEZ D: Count Tie-break Kaldır
**Değişiklik:** `findDefenderForAttacker`'da count tie-break kaldır, sadece order rank kullan  
**Sebep:** R7'de Bansheler (ally) round 3'te Spiderlings (10 birim, spd=4) hedefliyor, Bonewings (7 birim, spd=4) yerine. count>bestCount tie-break'i Spiderlings'i kazandırıyor.

**Sonuç:**
- ✅ R7 DÜZELDI (seed=0)
- ❌ R2 KÖTÜLEŞTI (8→15)
- ❌ R5 KÖTÜLEŞTI (9→19)
- ❌ **12 DOĞRU BOZULDU** (D3, D9, D12, D13, D14, D16, D17, D62, D84, D86, D91, D93)

**Özet:** Düzeldi=1 İyileşti=2 Aynı=6 Kötüleşti=2 — Doğru korunan: 82/94 ❌ REGRESYON!  
**Sonuç:** Kullanılamaz. Count tie-break çok fazla yerde doğru çalışıyor.

---

### HİPOTEZ E: Count Tie-break Kaldır + Witch REVERT
**Sonuç:** D ile aynı regresyon (82/94). ❌

---

### HİPOTEZ F: Spiderlings Düşük Öncelikli Hedef
**Değişiklik:** Count tie-break korunuyor ama iki kandidat arasında biri Spiderlings ise, Spiderlings her zaman kaybeder  
```javascript
// Speed eşitse:
(defenderIndex !== SPIDERLINGS_INDEX && bestDefenderIndex === SPIDERLINGS_INDEX) ||  // non-spider beats spider
((defenderIndex === SPIDERLINGS_INDEX) === (bestDefenderIndex === SPIDERLINGS_INDEX) && count > bestCount) ||  // normal count tiebreak
```

**Sonuç:**
- ✅ R7 DÜZELDI (seed=0)
- ❌ R2 KÖTÜLEŞTI (8→15)
- ❌ **2 DOĞRU BOZULDU** (D3, D84)

**Özet:** Düzeldi=1 İyileşti=3 Aynı=6 Kötüleşti=1 — Doğru korunan: 92/94 ❌ REGRESYON!  
**Analiz:** D3 ve D84 neden bozuluyor?

D3 (T9=4 Broodmother): Ally 8 Bansiler var. Spiderlings spawna giriyor.  
- Spiderlings ilk başta speed=6 (Bonewings ile eşit), Gargoyl reactive slow olmadan.  
- Spiderlings, Bonewings ile aynı hızda olduğu turlarda F patch devreye giriyor → Bansheler Bonewings'i hedefliyor.  
- Doğru davranış D3'te Bansheler Spiderlings'i hedeflemeli (count tiebreak: 10 > 8 Bonewings).  
- Bu, R7 ile çelişen durum: R7'de Spiderlings slowed (spd=4 = Bonewings spd=4), D3'te non-slowed (spd=6 = Bonewings spd=6).

**KRİTİK ÇATIŞMA:**
- R7: Spiderlings slowed (4=4), F patch → Bonewings kazanıyor → DOĞRU ✅
- D3: Spiderlings NOT slowed (6=6), F patch → Bonewings kazanıyor → YANLIŞ ❌

Her iki durumda speed eşit olduğundan F patch her ikisinde de aynı şekilde davranıyor.

---

### HİPOTEZ G: F + Witch REVERT
**Sonuç:** F'den bile kötü. 92/94 + witch revert bozuluşu. ❌

---

## ADIM 8 — R7 Analizi: Neden Bansheler Bonewings'i Hedeflemiyor?

**R7 bileşimi:**
- Düşman: 12-21-16-7-16-3-11-5-7-2 (T9=7 Broodmother, T4=7 Bonewings)
- Bizim: 38-49-44-6-9-8-1-0 (T4=6 Banshi, T6=8 Gargoyl)
- Gerçek kayıp: 16-49-0-0-9-3-1-0 (Banshi kaybı=0, Gargoyl kaybı=3)
- Baseline best: 16-49-0-6-9-3-1-0 (Banshi kaybı=6 yanlış!)

**Sorun mekanizması (BASELINE):**
- Round 3: Spiderlings speed=4 (Gargoyl slow sonrası), Bonewings speed=4
- Bansheler (ally rear, spd=7) enemy rear birimlerini hedefliyor: Spiderlings(10,spd=4) vs Bonewings(7,spd=4)
- count tie-break: 10 > 7 → Spiderlings kazanıyor
- Bansheler Spiderlings'i öldürüyor
- Sıra geldiğinde Bonewings (7 birim, occult) Bansilere (6 birim, monster, spd=7) saldırıyor
- 7×6 (saldırı)×1.5 (occult→monster) = 63 >> 24 HP → Tüm Bansheler ölüyor

**Gerçekte ne olması lazım:**
- Bansheler Bonewings'i hedeflemeli → Bonewings ölüyor → Bansheler hayatta kalıyor

**Neden D3 farklı:**
- D3'te Spiderlings henüz slowlanmamış (speed=6, Bonewings ile eşit)
- Doğru davranış: Bansheler Spiderlings'i hedeflemeli (count=10 > 8)
- F patch bu durumda da Bonewings'i seçiyor → D3 bozuluyor

**Temel çatışma özeti:**
- R7'de Bonewings hedeflenmeli (speed=4=4 tie; count 10>7 kuralı YANLIŞ)
- D3'te Spiderlings hedeflenmeli (speed=6=6 tie; count 10>8 kuralı DOĞRU)
- Her ikisi de speed tie durumu. F patch ayrım yapamıyor.

**Sonraki araştırma fikirleri:**
1. **Hipotez H**: Reactive slow sonrası Spiderlings vs original-speed Spiderlings ayrımı. Eğer birimin hızı kendi orijinal hızından düşük olmuşsa, onun yerine orijinal hızını kullan (ya da o birim için extra priority ver).
2. **Hipotez I**: Spiderlings'in sadece slow sonrası (speed < original) olduğunda düşük öncelik al.
3. **Hipotez J**: Bansiler için özel kural: Bonewings hayatta ve aynı speed grubundaysa, Bonewings'i önce hedefle (Banshee-specific fix, genel değil).

---

## Notlar

- TEST-REPORT.md'de denenmiş fix'ler (FIX1-FIX7) YENİDEN denenmeyecek
- Tüm değişiklikler approved (dogru.txt, 94 kayıt) üzerinde regresyon kontrolünden geçirilecek
- test-hipotez-2026-05-01.js → A,B,C,D,E,F,G hipotezleri içeriyor
