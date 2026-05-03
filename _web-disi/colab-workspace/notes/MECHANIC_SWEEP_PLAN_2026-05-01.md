# Mechanic Sweep Plan

Bu is, yanlis ve dogru savas veri seti uzerinde belirli mekanik varyantlarini toplu test eder.

## Supheli Mekanikler

- `witch splash`
- `broodmother spawn`
- `corpse revenge`
- `banshee reduce`

## Neden

Yanlis setin ana sapmasi T6 tarafinda toplaniyor.
Bu sweep'in amaci:

1. yanlislari ne kadar toparladigini olcmek
2. dogru seti ne kadar bozdugunu olcmek
3. "guvenli ama iyilestirici" varyant var mi gormek

## Calisma Bicimi

- her varyant icin battle-core bellek icinde patch'lenir
- her rapor icin 1..N seed araliginda gercek sonuca en cok yaklasan seed secilir
- wrong ve correct set ayri ayri skorlanir

## Cikti

- `correct exact rate`
- `correct avg weighted loss diff`
- `wrong exact rate`
- `wrong avg weighted loss diff`
- `wrong avg blood abs diff`

Siralamada once correct set korunur, sonra wrong sette iyilesme aranir.
