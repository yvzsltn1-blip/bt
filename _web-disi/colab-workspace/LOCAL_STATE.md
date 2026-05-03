# Local State

Bu dosya bilerek git'e alinmaz. Ama ayni makinede sonraki agent'in oturumu geri toplamasini kolaylastirir.

## Gecerli Worker

- Worker URL: `https://river-other-prices-porcelain.trycloudflare.com`
- Worker token: `yavuzsuls61`
- Runtime notu: `Colab GPU aktifti; smoke test Tesla T4 gosterdi.`
- Beklenen branch/commit: `work-colab-hazirlik-20260430 @ 1aaab64`

## Aktif Battle

- Stage: `75`
- Mode: `deep`
- Objective: `min_loss`
- Stone mode: `false`
- Diversity mode: `false`
- Payload dosyasi: `colab-workspace/config/stage75-deep-minloss.json`

Ally pool:

- `bats=111`
- `ghouls=111`
- `thralls=90`
- `banshees=95`
- `necromancers=33`
- `gargoyles=44`
- `witches=9`
- `rotmaws=0`

Enemy:

- `skeletons=16`
- `zombies=11`
- `cultists=20`
- `bonewings=23`
- `corpses=8`
- `wraiths=4`
- `revenants=12`
- `giants=5`
- `broodmothers=5`
- `liches=3`

## Sonraki Adim

- Colab repo `ce61a97` commit'ine guncellendi ve worker yeniden baslatildi.
- Colab worker bu payload icin job kabul etti ve calisiyor.
- `optimizer_search` job'i gonderildi.
- Gecerli remote job id: `c3775c48af7d43a1`
- Son bilinen durum: `running`
- Yerelde submit kaydi: `colab-workspace/runs/submitted-job-20260430-085714.json`
- Durum sorgu ornegi:
  `py -3 colab-workspace\client\submit_job.py --endpoint https://river-other-prices-porcelain.trycloudflare.com --token yavuzsuls61 --job-id c3775c48af7d43a1 --wait --save-dir colab-workspace\runs`

## Donuste Ilk Komut

```powershell
py -3 colab-workspace\client\submit_job.py --endpoint https://river-other-prices-porcelain.trycloudflare.com --token yavuzsuls61 --job-id c3775c48af7d43a1 --wait --save-dir colab-workspace\runs
```
